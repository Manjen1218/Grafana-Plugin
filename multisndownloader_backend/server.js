import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import cors from 'cors';
import pLimit from 'p-limit';
import zlib from 'zlib';
import tarStream from 'tar-stream';
import { pipeline } from 'stream/promises';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const MOUNT_ROOT = process.env.MOUNT_ROOT || '/your/folder/';

app.post('/download_multi_sn_stream', async (req, res) => {
  const MAX_CONCURRENT_FILES = Number(process.env.MAX_CONCURRENT_FILES || 20);
  let pack = null;
  let gzip = null;
  try {
    const { db, files } = req.body || {};
    console.log('Request body received:', JSON.stringify({ db, files: files ? Object.keys(files) : 'none' }));
    if (!db || !files || typeof files !== 'object') return res.status(400).send('Invalid request body');

    const allFileEntries = [];
    for (const [sn, filePaths] of Object.entries(files)) for (const fullpath of filePaths) allFileEntries.push({ sn, fullpath: String(fullpath).replace(/^\/mnt\/FTP_log|^\/your\/folder/, MOUNT_ROOT) });
    const total = allFileEntries.length;
    console.log(`Starting tar creation for ${total} files.`);
    if (total === 0) return res.status(400).send('No valid files to download.');

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${db}_download.tar.gz"`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    pack = tarStream.pack();
    gzip = zlib.createGzip();
    const streamPipeline = pipeline(pack, gzip, res).catch(err => console.error('Stream pipeline error:', err));

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    const addFile = async ({ sn, fullpath }) => {
      if (controller.signal.aborted) return;
      try {
        const st = await fs.stat(fullpath);
        if (!st.isFile()) return;
        await new Promise((resolve, reject) => {
          const entry = pack.entry({ name: path.join(sn, path.basename(fullpath)), size: st.size, mode: st.mode, mtime: st.mtime }, err => err ? reject(err) : resolve());
          const rs = fs.createReadStream(fullpath);
          rs.pipe(entry);
          rs.on('error', reject);
        });
      } catch (err) { console.warn('Skipping file', fullpath, err && err.message); }
    };

    const limit = pLimit(MAX_CONCURRENT_FILES);
    await Promise.all(allFileEntries.map(e => limit(() => addFile(e))));
    pack.finalize();
    await streamPipeline;
    console.log(`Download completed successfully for ${total} files.`);
  } catch (err) {
    console.error('Error in download stream:', err);
    if (pack) pack.destroy();
    if (gzip) gzip.destroy();
    if (!res.headersSent) return res.status(500).send('Internal server error: ' + (err && err.message));
    res.end();
  }
});

app.listen(PORT, process.env.BIND_HOST || '0.0.0.0', () => {
  console.log(`File download service running at http://${process.env.BIND_HOST || '0.0.0.0'}:${PORT}`);
});
