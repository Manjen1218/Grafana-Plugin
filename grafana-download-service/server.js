import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import mysql from 'mysql2/promise';
import { spawn } from 'child_process'
import cors from 'cors';
import tarStream from 'tar-stream';
import multer from 'multer';
import * as tar from 'tar';
import tmp from 'tmp';
import { parse } from 'csv-parse/sync';
import pLimit from 'p-limit';
import XLSX from 'xlsx';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';

import parseLogRoute from './testParser.js';
import logFilesRoute from './logFilesRoute.js';
import logMatcher from './logMatcher.js';
import mccLogFile from './mccLogFile.js';
import multiSnDataFetch from './multiSnDataFetch.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const MOUNT_ROOT = '/home/template/remote_mount';
const upload = multer({ storage: multer.memoryStorage() });

const { createReadStream, statSync } = fs;

function sanitizeErrMsg(msg) {
  return msg
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace invalid characters with underscore
    .substring(0, 100); // Limit folder name length if needed
}

async function streamTarWithFolders(rows, pack) {
  const grouped = {};
  for (const row of rows) {
    console.log(row);
    const key = `${row.err_id}|||${row.err_msg}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  for (const key in grouped) {
    const [err_id, err_msg] = key.split('|||');
    const fileGroup = grouped[key];
    const count = fileGroup.length;
    const safeErrMsg = sanitizeErrMsg(err_msg);
    const folderName = `${err_id}_${count}_${safeErrMsg}`;

    for (const row of fileGroup) {
      const correctedPath = row.fullpath.replace(/^\/mnt\/FTP_log/, MOUNT_ROOT);

      if (!fs.existsSync(correctedPath)) {
        console.warn(`Skipping missing file: ${correctedPath}`);
        continue;
      }

      const filename = path.basename(correctedPath);
      const archiveName = path.join(folderName, filename); // custom path inside archive

      const stat = statSync(correctedPath);
      const stream = createReadStream(correctedPath);

      await new Promise((resolve, reject) => {
        const entry = pack.entry(
          { name: archiveName, size: stat.size, mode: 0o644 },
          err => (err ? reject(err) : resolve())
        );
        stream.pipe(entry);
      });

      console.log(`Packed ${correctedPath} as ${archiveName}`);
    }
  }

  pack.finalize();
}

async function getConnection(database) {
  return await mysql.createConnection({
    host: '192.168.50.203',
    port: 3306,
    user: 'sql_dev',
    password: '13301330',
    database: database,
    timezone: 'Z'
  });
}

app.use('/api', multiSnDataFetch);
app.use('/api', parseLogRoute);
app.use('/api', logFilesRoute);
app.use('/api', mccLogFile);
app.use('/api', logMatcher);

app.get('/api/err_pattern', (req, res) => {
  const jsonPath = 'global_err.json';
  fs.readFile(jsonPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Failed to read JSON:', err);
      return res.status(500).json({ error: 'Failed to load config' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  });
});

app.get('/api/files', (req, res) => {
  let { filepath } = req.query;
  try {
    filepath = decodeURIComponent(filepath); // decode %2F into '/'
  } catch (e) {
    return res.status(400).send('Invalid URL encoding');
  }

  // Sanitize filename to prevent directory traversal attacks
  if (filepath.includes('..')) {
    return res.status(400).send('Invalid filename');
  }

  const requestedPath = filepath.replace(/^\/mnt\/FTP_log/, MOUNT_ROOT);  
  const filename = path.basename(requestedPath);
  
  // Check if file exists
  fs.stat(requestedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).send('File not found');
    }

    // Set headers to prompt download in browser
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    // Stream the file to client
    const readStream = fs.createReadStream(requestedPath);
    readStream.pipe(res);
  });
});

app.post('/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  let records;

  try {
    if (ext === '.csv') {
      // Parse CSV
      records = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
      });
    } else if (ext === '.xlsx') {
      // Parse Excel
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      records = XLSX.utils.sheet_to_json(sheet);
    } else if (ext === '.txt') {
      // Convert buffer to string
      const content = req.file.buffer.toString('utf8');

      records = content
        .split(/\s*,\s*|\s+|,+/)
        .map((item) => item.trim())
        .filter((item) => item);

      if (records.length === 0) {
        return res.status(400).json({ error: 'No serial numbers found in .txt file' });
      }

      const serialNumbersStr = records.join(',');

      return res.json({ serialNumbers: serialNumbersStr });
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    if (!records || records.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    const columnName = Object.keys(records[0]).find(
      (col) =>
        col.toLowerCase() === 'sn' || col.toLowerCase() === 'serial number'
    );

    if (!columnName) {
      return res
        .status(400)
        .json({ error: 'No "sn" or "serial number" column found' });
    }

    const serialNumbers = records
      .map((row) => row[columnName])
      .filter((val) => val != null && val !== '');

    const serialNumbersStr = serialNumbers.join(',');

    return res.json({ serialNumbers: serialNumbersStr });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error processing file' });
  }
});

app.get('/databases', async (req, res) => {
  const pool = mysql.createPool({
    host: '192.168.50.203',
    port: 3306,
    user: 'sql_dev',
    password: '13301330',
    timezone: 'Z'
  });

  try {
    const [rows] = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'k2%' ORDER BY schema_name`
    );

    const dbNames = rows.map((row) => row.schema_name);

    res.json({ skus: dbNames });
  } catch (error) {
    console.error("Error fetching databases:", error);
    res.status(500).json({ error: "Failed to fetch databases" });
  }
});

app.get('/wo', async (req, res) => {
  const db = req.query.db; // Correct way to get query parameters
  const tb = req.query.ts;

  if (!db || !tb) {
    return res.status(400).send('Missing db or ts query parameter.');
  }

  let connection;
  try {
    connection = await getConnection(db); // Await the connection
    const sql = `
      SELECT DISTINCT wo 
      FROM \`${tb}\`
      WHERE is_y = 1
    `;

    const [rows] = await connection.execute(sql);
    res.json(rows);
  } catch (dbErr) {
    console.error('DB error:', dbErr);
    res.status(500).send('Database query failed.');
  } finally {
    if (connection && typeof connection.end === 'function') {
      await connection.end();
    }
  }
});

app.post('/sn_filepaths', async (req, res) => {
  const { db: database, snList } = req.body;

  if (!database || snList.length === 0) {
    return res.status(400).send('Missing or invalid db or snList.');
  }

  const snArray = snList.split(/[\s,]+/).map(sn => sn.trim()).filter(sn => sn);
  if (snArray.length === 0) return res.status(400).send('Empty snList.');

  let connection;
  try {
    connection = await getConnection(database);

    const [tables] = await connection.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND COLUMN_NAME IN ('sn', 'bname', 'fullpath', 'tbeg', 'is_y')
      GROUP BY TABLE_NAME
      HAVING COUNT(DISTINCT COLUMN_NAME) = 5;
    `, [database]);

    const snPlaceholders = snArray.map(() => '?').join(',');
    const queries = tables.map(row => {
      const tableName = row.TABLE_NAME;
      const query = `
        SELECT 
          '${database}' AS sku, 
          sn, 
          bname,
          tbeg,
          CASE WHEN err_msg IS NULL THEN 'PASS' ELSE 'FAIL' END AS status,
          CASE WHEN is_y = 1 THEN 1 ELSE 0 END AS is_y,
          '${tableName}' AS table_name,
          fullpath
        FROM \`${tableName}\`
        WHERE sn IN (${snPlaceholders})
      `;
      return connection.query(query, snArray);
    });

    const results = await Promise.all(queries);
    const allRows = results.flatMap(([rows]) => rows);

    if (allRows.length === 0) {
      return res.status(404).send('No matching files found.');
    }

    const snMap = {};
    for (const row of allRows) {
      const { sku, sn, bname, tbeg, status, is_y, table_name, fullpath } = row;
      const localTbeg = new Date(tbeg);
      localTbeg.setHours(localTbeg.getHours() + 8);

      if (!snMap[sn]) snMap[sn] = [];
      snMap[sn].push({ sku, bname, tbeg: localTbeg.toISOString(), status, is_y, table_name, fullpath });
    }
    
    res.json(snMap);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error.');
  } finally {
    if (connection) connection.end();
  }
});

app.post("/download_multi_sn", async (req, res) => {
  try {
    const { db, files } = req.body; // files = { sn1: [file1, file2], sn2: [file3], ... }

    if (!db || !files || typeof files !== "object") {
      return res.status(400).send("Invalid request body");
    }

    const tempDir = tmp.dirSync({ unsafeCleanup: true }).name;

    const limit = pLimit(5);

    // Copy files to tempDir organized by SN
    await Promise.all(
      Object.entries(files).flatMap(([sn, filePaths]) =>
        filePaths.map((fullpath) =>
          limit(async () => {
            const correctedPath = fullpath.replace(/^\/mnt\/FTP_log/, MOUNT_ROOT);
            const snDir = path.join(tempDir, sn);
            await fs.ensureDir(snDir);
            if (await fs.pathExists(correctedPath)) {
              const filename = path.basename(correctedPath);
              const destPath = path.join(snDir, filename);
              await fs.copy(correctedPath, destPath);
            }
          })
        )
      )
    );

    // Create tar.gz archive
    const snFolders = Object.entries(files)
      .filter(([, fileList]) => Array.isArray(fileList) && fileList.length > 0)
      .map(([sn]) => sn);
    const tarPath = path.join(tempDir, "download.tar.gz");
    await tar.c(
      {
        gzip: true,
        file: tarPath,
        cwd: tempDir,
        portable: true,
      },
      snFolders
    );

    // Send tar.gz file
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", "attachment; filename=download.tar.gz");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    const readStream = fs.createReadStream(tarPath);
    readStream.pipe(res);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Internal server error.");
  }
});

app.post("/download_multi_sn_stream", async (req, res) => {
  const MAX_CONCURRENT_FILES = 20; // higher concurrency, tune for your disk/network

  let pack = null;
  let gzip = null;

  try {
    const { db, files } = req.body;
    console.log(
      "Request body received:",
      JSON.stringify({ db, files: files ? Object.keys(files) : "none" })
    );

    if (!db || !files || typeof files !== "object") {
      return res.status(400).send("Invalid request body");
    }

    // Flatten file entries
    const allFileEntries = [];
    for (const [sn, filePaths] of Object.entries(files)) {
      for (const fullpath of filePaths) {
        const correctedPath = fullpath.replace(/^\/mnt\/FTP_log/, MOUNT_ROOT);
        allFileEntries.push({ sn, fullpath, correctedPath });
      }
    }

    const totalFiles = allFileEntries.length;
    console.log(`Starting tar creation for ${totalFiles} files.`);

    if (totalFiles === 0) {
      return res.status(400).send("No valid files to download.");
    }

    // Set headers
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${db}_download.tar.gz"`
    );
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Create tar + gzip streams
    pack = tarStream.pack();
    gzip = zlib.createGzip();

    const streamPipeline = pipeline(pack, gzip, res).catch((err) => {
      console.error("Stream pipeline error:", err);
    });

    // Handle client disconnect
    const controller = new AbortController();
    const { signal } = controller;

    res.on("close", () => {
      if (!signal.aborted) {
        console.log("Client closed connection, aborting.");
        controller.abort();
      }
    });

    // Helper to add files to tar
    const addFileToTar = async ({ sn, fullpath, correctedPath }) => {
      if (signal.aborted) throw new Error("Request aborted by client");

      try {
        const stats = await fs.stat(correctedPath);
        if (!stats.isFile()) {
          console.warn(`Not a file: ${correctedPath}`);
          return;
        }

        const filename = path.basename(correctedPath);

        return new Promise((resolve, reject) => {
          const entry = pack.entry(
            {
              name: path.join(sn, filename),
              size: stats.size,
              mode: stats.mode,
              mtime: stats.mtime,
            },
            (err) => {
              if (err) reject(err);
            }
          );

          if (!entry) return resolve();

          const fileStream = fs.createReadStream(correctedPath);
          fileStream
            .pipe(entry)
            .on("finish", resolve)
            .on("error", reject);
        });
      } catch (error) {
        console.error(`Error processing file ${fullpath}:`, error);
      }
    };

    // Run with concurrency control
    const limit = pLimit(MAX_CONCURRENT_FILES);
    await Promise.all(allFileEntries.map((f) => limit(() => addFileToTar(f))));

    console.log("All files processed. Finalizing tar.");
    pack.finalize();

    await streamPipeline;
    console.log(`Download completed successfully for ${totalFiles} files.`);
  } catch (err) {
    console.error("Error in download stream:", err);

    if (pack) pack.destroy();
    if (gzip) gzip.destroy();

    if (!res.headersSent) {
      res.status(500).send("Internal server error: " + err.message);
    } else {
      res.end();
    }
  }
});

app.get('/view-file', (req, res) => {
  const filePath = req.query.path;
  const fileName = req.query.name || 'file.txt';

  if (!filePath || !filePath.startsWith(MOUNT_ROOT)) {
    return res.status(400).send('Invalid or missing path.');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found.');
  }

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error displaying file:', err);
      res.status(500).send('Error displaying file.');
    }
  });
});

app.get('/view-log/:bname', (req, res) => {
  const bname = req.params.bname;
  const filePath = req.query.filePath;

  if (!filePath) {
    return res.status(400).send('Missing filePath query parameter.');
  }

  const localPath = filePath.replace(/^\/mnt\/FTP_log/, MOUNT_ROOT);

  if (!localPath.startsWith(MOUNT_ROOT)) {
    return res.status(400).send('Invalid file path.');
  }

  // Build MCC path
  const mccPath = localPath.split('/').filter(Boolean);
  if (mccPath.length > 5) {
    mccPath[5] = mccPath[5] + '-MCC';
  }
  const last = mccPath[mccPath.length - 1];
  mccPath[mccPath.length - 1] = last.replace(/\.cap$/, '.mcc');
  const mccLocalPath = path.join('/', ...mccPath);
  const result = {};

  // Check if .cap file exists
  if (fs.existsSync(localPath)) {
    result.capUrl = `/view-file?path=${encodeURIComponent(localPath)}&name=${encodeURIComponent(bname + '.cap')}`;
  } else {
    result.capError = 'CAP file not found.';
  }

  // Check if .mcc file exists
  if (fs.existsSync(mccLocalPath)) {
    result.mccUrl = `/view-file?path=${encodeURIComponent(mccLocalPath)}&name=${encodeURIComponent(bname + '.mcc')}`;
  } else {
    result.mccError = 'MCC file not found.';
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Opening Logs</title>
        <script>
          window.onload = function() {
            ${result.capUrl ? `window.open("${result.capUrl}", "_blank");` : ''}
            ${result.mccUrl ? `window.open("${result.mccUrl}", "_blank");` : ''}
          };
        </script>
      </head>
      <body>
        <h2>Opening logs...</h2>
        ${!result.capUrl ? '<p>CAP file not found.</p>' : ''}
        ${!result.mccUrl ? '<p>MCC file not found.</p>' : ''}
      </body>
    </html>
  `);
});

app.get('/download-log', (req, res) => {
  const filePath = req.query.filePath;

  if (!filePath) {
    return res.status(400).send('Missing filePath query parameter.');
  }

  console.log('Requested file path:', filePath);

  // Replace remote root with your local mount root

  // Map remote file path to local mounted path
  const localPath = filePath.replace(/^\/mnt\/FTP_log/, MOUNT_ROOT);

  // Security: avoid directory traversal attacks
  if (!localPath.startsWith(MOUNT_ROOT)) {
    return res.status(400).send('Invalid file path.');
  }

  if (!fs.existsSync(localPath)) {
    return res.status(404).send('File not found.');
  }

  // Send the file directly to the client
  res.download(localPath, path.basename(localPath), (err) => {
    if (err) {
      console.error('Error sending file:', err);
    }
  });
});

app.get('/download_by_err', async (req, res) => {
  const errMsgRaw = req.query.err_msg;
  const database = req.query.db;
  const errId = req.query.err_id;
  const table = req.query.table;
  const from_time = req.query.from_time;
  const end_time = req.query.end_time;

  if (!errMsgRaw) return res.status(400).send('Missing err_msg parameter.');
  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        fullpath, 
        err_id, 
        err_msg 
      FROM \`${table}\` 
      WHERE 
        err_msg = ? 
        AND err_id = ? 
        AND tbeg BETWEEN ? AND ?
    `;

    const [rows] = await connection.execute(sql, [errMsgRaw.trim(), errId, from_time, end_time]);

    console.log(errMsgRaw, from_time, end_time)

    if (rows.length === 0) {
      return res.status(404).send('No files found for the error message.');
    }

    const sanitizedErrMsg = sanitizeErrMsg(errMsgRaw.trim());
    const archiveName = `${database}_${table}_${sanitizedErrMsg}_${from_time}_${end_time}.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    if (connection) await connection.end();
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/download_all', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const from_time = req.query.from_time;
  const end_time = req.query.end_time;

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        CASE 
          WHEN err_id IS NULL AND err_msg IS NULL THEN 'PASS'
          WHEN err_id IS NULL AND err_msg IS NOT NULL THEN 'NULL'
          ELSE err_id
        END AS err_id, 
        fullpath, 
        IFNULL(err_msg, 'PASS') AS err_msg 
      FROM \`${table}\` 
      WHERE tbeg BETWEEN ? AND ?
    `;
    const [rows] = await connection.execute(sql, [from_time, end_time]);
    console.log(`${rows.length} files found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files.');
    }

    const archiveName = `${database}_${table}_${from_time}_${end_time}_all.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    if (connection) await connection.end();
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/download_fail', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const from_time = req.query.from_time;
  const end_time = req.query.end_time;

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        IFNULL(err_id, 'NULL') AS err_id, 
        fullpath, 
        err_msg 
      FROM \`${table}\` 
      WHERE 
        err_msg IS NOT NULL
        AND tbeg BETWEEN ? AND ?
    `;
    const [rows] = await connection.execute(sql, [from_time, end_time]);
    console.log(`${rows.length} files with errors found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files with error.');
    }

    const [passRows] = await connection.execute(`
      SELECT 'PASS' AS err_id, fullpath, 'Pass' AS err_msg 
      FROM \`${table}\` 
      WHERE err_msg IS NULL AND tbeg BETWEEN ? AND ?
      ORDER BY RAND() 
      LIMIT 1
    `, [from_time, end_time]);

    if (passRows.length > 0) {
      rows.push(passRows[0]); // Add one passing file
    }
    
    const archiveName = `${database}_${table}_${from_time}_${end_time}_fail.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    if (connection) await connection.end();
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/download_wip', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const from_time = req.query.from_time;
  const end_time = req.query.end_time;

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        IFNULL(p.err_id, 'NULL') AS err_id,
        p.fullpath,
        p.err_msg
      FROM \`${table}\` p
      INNER JOIN (
        SELECT DISTINCT sn
        FROM \`${table}\`
        WHERE tbeg BETWEEN ? AND ?
      ) filtered_sn
        ON p.sn = filtered_sn.sn
      INNER JOIN (
        SELECT sn, MAX(tbeg) AS max_tbeg
        FROM \`${table}\`
        GROUP BY sn
      ) first_record
        ON p.sn = first_record.sn AND p.tbeg = first_record.max_tbeg
      WHERE p.err_msg IS NOT NULL
    `;

    const [rows] = await connection.execute(sql, [from_time, end_time]);
    console.log(`${rows.length} files with errors found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files with error.');
    }

    const [passRows] = await connection.execute(`
      SELECT 
        'PASS' AS err_id, 
        fullpath, 
        'Pass' AS err_msg 
      FROM \`${table}\` 
      WHERE 
        err_msg IS NULL 
        AND tbeg BETWEEN ? AND ?
      ORDER BY RAND() 
      LIMIT 1
    `, [from_time, end_time]);

    if (passRows.length > 0) {
      rows.push(passRows[0]); // Add one passing file
    }

    const archiveName = `${database}_${table}_${from_time}_${end_time}_wip.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    if (connection) await connection.end();
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/download_first_fail', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const from_time = req.query.from_time;
  const end_time = req.query.end_time;

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        IFNULL(p.err_id, 'NULL') AS err_id,
        p.fullpath,
        p.err_msg
      FROM \`${table}\` p
      INNER JOIN (
        SELECT DISTINCT sn
        FROM \`${table}\`
        WHERE tbeg BETWEEN ? AND ?
      ) filtered_sn
        ON p.sn = filtered_sn.sn
      INNER JOIN (
        SELECT sn, MIN(tbeg) AS min_tbeg
        FROM \`${table}\`
        GROUP BY sn
      ) first_record
        ON p.sn = first_record.sn AND p.tbeg = first_record.min_tbeg
      WHERE p.err_msg IS NOT NULL
    `;

    const [rows] = await connection.execute(sql, [from_time, end_time]);
    console.log(`${rows.length} files with errors found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files with error.');
    }

    const [passRows] = await connection.execute(`
      SELECT 
        'PASS' AS err_id, 
        fullpath, 
        'Pass' AS err_msg 
      FROM \`${table}\` 
      WHERE err_msg IS NULL
      ORDER BY RAND() 
      LIMIT 1
    `);

    if (passRows.length > 0) {
      rows.push(passRows[0]); // Add one passing file
    }

    const archiveName = `${database}_${table}_${from_time}_${end_time}_first_fail.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/wo_download_by_err', async (req, res) => {
  const errMsgRaw = req.query.err_msg;
  const database = req.query.db;
  const errId = req.query.err_id;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean); 

  if (!errMsgRaw) return res.status(400).send('Missing err_msg parameter.');
  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');
  if (woList.length === 0) return res.status(400).send('Missing work order parameter.');

  let errMsg = errMsgRaw.trim();
  const placeholders = woList.map(() => '?').join(', ');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        fullpath, 
        err_id, 
        err_msg 
      FROM \`${table}\` 
      WHERE 
        err_msg = ? 
        AND err_id = ? 
        AND wo IN (${placeholders}) 
        AND is_y = 1
    `;

    const [rows] = await connection.execute(sql, [errMsg, errId, ...woList]);

    if (rows.length === 0) {
      return res.status(404).send('No files found for the error message.');
    }
    
    const archiveName = `${database}_${table}_${woName}_${sanitizeErrMsg(errMsg)}.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    if (connection) await connection.end();
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/wo_download_fail', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean);

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');
  if (woList.length === 0) return res.status(400).send('Missing work order parameter.');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  const placeholders = woList.map(() => '?').join(', ');

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        IFNULL(err_id, 'NULL') AS err_id, 
        fullpath, 
        err_msg 
      FROM \`${table}\` 
      WHERE 
        err_msg IS NOT NULL 
        AND wo IN (${placeholders})
        AND is_y = 1
    `;

    const [rows] = await connection.execute(sql, [...woList]);
    console.log(`${rows.length} files with errors found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files with error.');
    }

    const [passRows] = await connection.execute(`
      SELECT 
        'PASS' AS err_id, 
        fullpath, 
        'Pass' AS err_msg 
      FROM \`${table}\` 
      WHERE err_msg IS NULL
        AND wo IN (${placeholders})
        AND is_y = 1 
      ORDER BY RAND() 
      LIMIT 1
    `, [...woList]);

    if (passRows.length > 0) {
      rows.push(passRows[0]); // Add one passing file
    }

    const archiveName = `${database}_${table}_${woName}_fail.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/wo_download_all', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean);

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');
  if (woList.length === 0) return res.status(400).send('Missing work order parameter.');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  const placeholders = woList.map(() => '?').join(', ');

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        CASE 
          WHEN err_id IS NULL AND err_msg IS NULL THEN 'PASS'
          WHEN err_id IS NULL AND err_msg IS NOT NULL THEN 'NULL'
          ELSE err_id
        END AS err_id, 
        fullpath, 
        IFNULL(err_msg, 'PASS') AS err_msg 
      FROM \`${table}\` 
      WHERE wo IN (${placeholders})
    `;

    const [rows] = await connection.execute(sql, [...woList]);
    console.log(`${rows.length} files with errors found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files with error.');
    }

    const archiveName = `${database}_${table}_${woName}_all.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/wo_download_wip', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean);

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');
  if (woList.length === 0) return res.status(400).send('Missing work order parameter.');

  const placeholders = woList.map(() => '?').join(', ');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        IFNULL(p.err_id, 'NULL') AS err_id,
        p.fullpath,
        p.err_msg
      FROM \`${table}\` p
      INNER JOIN (
        SELECT 
          sn,
          MAX(tbeg) AS max_tbeg
        FROM \`${table}\`
        WHERE is_y = 1 
        AND wo IN (${placeholders})
        GROUP BY sn
      ) latest
        ON p.sn = latest.sn AND p.tbeg = latest.max_tbeg
      WHERE p.wo IN (${placeholders}) AND p.err_msg IS NOT NULL
    `;

    const [rows] = await connection.execute(sql, [...woList, ...woList]);
    console.log(`${rows.length} files with errors found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files with error.');
    }

    const [passRows] = await connection.execute(`
      SELECT 
        'PASS' AS err_id, 
        fullpath, 
        'Pass' AS err_msg 
      FROM \`${table}\` 
      WHERE 
        err_msg IS NULL
        AND wo IN (${placeholders}) 
      ORDER BY RAND() 
      LIMIT 1
    `, [...woList]);

    if (passRows.length > 0) {
      rows.push(passRows[0]); // Add one passing file
    }

    const archiveName = `${database}_${table}_${woName}_wip.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/wo_download_first_fail', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean);

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');
  if (woList.length === 0) return res.status(400).send('Missing work order parameter.');

  const placeholders = woList.map(() => '?').join(', ');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        IFNULL(p.err_id, 'NULL') AS err_id,
        p.fullpath,
        p.err_msg
      FROM \`${table}\` p
      INNER JOIN (
        SELECT 
          sn,
          MIN(tbeg) AS min_tbeg
        FROM \`${table}\`
        WHERE is_y = 1
        AND wo IN (${placeholders})
        GROUP BY sn
      ) first
        ON p.sn = first.sn AND p.tbeg = first.min_tbeg
      WHERE p.wo IN (${placeholders}) AND p.err_msg IS NOT NULL
    `;

    const [rows] = await connection.execute(sql, [...woList, ...woList]);
    console.log(`${rows.length} files with errors found.`);

    if (rows.length === 0) {
      return res.status(404).send('No files with error.');
    }

    const [passRows] = await connection.execute(`
      SELECT 
        'PASS' AS err_id, 
        fullpath, 
        'Pass' AS err_msg 
      FROM \`${table}\` 
      WHERE 
        err_msg IS NULL
        AND is_y = 1
        AND wo IN (${placeholders}) 
      ORDER BY RAND() 
      LIMIT 1
    `, [...woList]);

    if (passRows.length > 0) {
      rows.push(passRows[0]); // Add one passing file
    }
    
    const archiveName = `${database}_${table}_${woName}_first_fail.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/wo_mcc_by_err', async (req, res) => {
  const errMsgRaw = req.query.err_msg;
  const database = req.query.db;
  const errId = req.query.err_id;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean); 

  if (!errMsgRaw) return res.status(400).send('Missing err_msg parameter.');
  if (!database) return res.status(400).send('Missing db parameter.');
  if (!table) return res.status(400).send('Missing table parameter.');
  if (woList.length === 0) return res.status(400).send('Missing work order parameter.');

  let errMsg = errMsgRaw.trim();
  const placeholders = woList.map(() => '?').join(', ');

  const allowedTables = ['pt', 'pts', 'pdlp', 'baking_i', 'baking_o'];
  if (!allowedTables.includes(table)) {
    return res.status(400).send('Invalid table parameter.');
  }

  let connection;
  try {
    connection = await getConnection(database);

    const sql = `
      SELECT 
        fullpath, 
        \`${errId}\`
      FROM \`${table}\` 
      WHERE 
        \`${errId}\` = ? 
        AND wo IN (${placeholders}) 
        AND is_y = 1
    `;

    const [rows] = await connection.execute(sql, [errMsg, ...woList]);

    if (rows.length === 0) {
      return res.status(404).send('No files found for the error message.');
    }
    
    const archiveName = `${database}_${table}_${woName}_${sanitizeErrMsg(errMsg)}.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(rows, pack);

  } catch (dbErr) {
    console.error('DB error:', dbErr);
    if (connection) await connection.end();
    res.status(500).send('Database query failed.');
  } finally {
    if (connection) await connection.end();
  }
});

app.get('/sn_download_all', async (req, res) => {
  const database = req.query.db;
  const tableList = req.query.tableList;
  const tables = tableList.split(',').map(t => t.trim());
  const sn = req.query.sn;
  const allPaths = [];

  if (!database) return res.status(400).send('Missing db parameter.');
  if (!sn) return res.status(400).send('Missing serial number parameter.');

  let connection;
  try {
    connection = await getConnection(database);

    for (const table of tables) {
      const query = `
        SELECT 
          CASE 
            WHEN err_id IS NULL AND err_msg IS NULL THEN 'PASS'
            WHEN err_id IS NULL AND err_msg IS NOT NULL THEN 'NULL'
            ELSE err_id
          END AS err_id, 
          fullpath, 
          IFNULL(err_msg, 'PASS') AS err_msg 
        FROM \`${database}\`.\`${table}\` 
        WHERE 
          sn = ? 
          AND fullpath IS NOT NULL
          AND is_y = 1
      `;
      const [rows] = await connection.execute(query, [sn]);
      allPaths.push(...rows);
    }

    if (allPaths.length === 0) {
      return res.status(404).send('No files found for provided serial number.');
    }

    const archiveName = `${database}_${sn}.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const pigz = spawn('pigz', ['-c', '-9']);
    pigz.stderr.on('data', data => console.error('pigz error:', data.toString()));
    pigz.stdout.pipe(res);

    const pack = tarStream.pack();
    pack.pipe(pigz.stdin);

    await streamTarWithFolders(allPaths, pack);

  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Internal server error.');
  } finally {
    if (connection) await connection.end();
  }
});

app.listen(PORT, '192.168.50.206', () => {
  console.log(`File download service running at http://192.168.50.206:${PORT}`);
});
