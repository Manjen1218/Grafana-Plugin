/*
  Clean-room rewrite of error_analysis_backend/server.js
  - Preserves public routes and query shapes observed in the original implementation
  - Uses safer patterns: explicit parameter checks, prepared statements, identifier sanitization
  - Configurable via environment variables: DB_* and BIND_HOST/PORT
*/

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const HOST = process.env.BIND_HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: 0,
  timezone: 'Z'
});

function parseWoList(raw) {
  if (!raw) return [];
  try {
    const decoded = decodeURIComponent(String(raw));
    return decoded.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function getColumns(database, table) {
  // Return array of column names present on the table.
  const sql = `SHOW COLUMNS FROM \`${database.replace(/`/g, '')}\`.\`${table.replace(/`/g, '')}\``;
  const [rows] = await pool.query(sql);
  return rows.map(r => r.Field);
}

function buildSocMaxExpression(cols = []) {
  const socCandidates = ['critical_temp_max', 'soc_t_max1', 'soc_t_max2', 'soc_t_max3', 'soc_t_max4'];
  const present = cols.filter(c => socCandidates.includes(c));
  if (present.length === 0) return 'NULL AS soc_max_t';
  const exprs = present.map(c => `IFNULL(d.${c}, -999)`).join(', ');
  return `NULLIF(GREATEST(${exprs}), -999) AS soc_max_t`;
}

function handleError(res, err) {
  console.error(err && err.stack ? err.stack : err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
}


app.get('/wo_table', async (req, res) => {
  try {
    const { err_msg, err_id, db: database, table } = req.query;
    const woList = parseWoList(req.query.wo || '');
    if (!err_msg || !err_id || !database || !table) return res.status(400).json({ error: 'Missing required query parameters' });
    if (woList.length === 0) return res.json([]);

    const cols = await getColumns(database, table);
    const socExpr = buildSocMaxExpression(cols);

    const placeholders = woList.map(() => '?').join(',');
    const sql = `WITH fail_counts AS (
        SELECT sn, COUNT(*) AS fail_count
        FROM \`${database}\`.\`${table}\`
        WHERE err_msg IS NOT NULL AND is_y = 1
        GROUP BY sn
      ), latest_records AS (
        SELECT sn, MAX(tbeg) AS latest_tbeg
        FROM \`${database}\`.\`${table}\`
        WHERE is_y = 1
        GROUP BY sn
      ), final_status AS (
        SELECT t.sn, t.wo, t.err_msg AS latest_err_msg
        FROM \`${database}\`.\`${table}\` t
        JOIN latest_records l ON t.sn = l.sn AND t.tbeg = l.latest_tbeg
      )
      SELECT d.*, ${socExpr},
        CASE WHEN f.latest_err_msg IS NULL THEN 'True' ELSE 'False' END AS Finally_Pass,
        CASE WHEN f.wo != d.wo THEN 'True' ELSE 'False' END AS Cross_Wo,
        COALESCE(fc.fail_count, 0) AS Fail_Count
      FROM \`${database}\`.\`${table}\` d
      LEFT JOIN final_status f ON d.sn = f.sn
      LEFT JOIN fail_counts fc ON d.sn = fc.sn
      WHERE d.err_msg = ? AND d.err_id = ? AND d.wo IN (${placeholders}) AND d.is_y = 1;`;

    const params = [String(err_msg).trim(), String(err_id).trim(), ...woList];
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});

app.get('/sku_table', async (req, res) => {
  try {
    const { err_msg, err_id, db: database, table, from_time, end_time } = req.query;
    if (!err_msg || !err_id || !database || !table || !from_time || !end_time) return res.status(400).json({ error: 'Missing required query parameters' });

    const cols = await getColumns(database, table);
    const socExpr = buildSocMaxExpression(cols);

    const sql = `WITH fail_counts AS (
        SELECT sn, COUNT(*) AS fail_count
        FROM \`${database}\`.\`${table}\`
        WHERE err_msg IS NOT NULL AND is_y = 1
        GROUP BY sn
      ), latest_records AS (
        SELECT sn, MAX(tbeg) AS latest_tbeg
        FROM \`${database}\`.\`${table}\`
        WHERE is_y = 1
        GROUP BY sn
      ), final_status AS (
        SELECT t.sn, t.wo, t.err_msg AS latest_err_msg
        FROM \`${database}\`.\`${table}\` t
        JOIN latest_records l ON t.sn = l.sn AND t.tbeg = l.latest_tbeg
      )
      SELECT d.*, ${socExpr},
        CASE WHEN f.latest_err_msg IS NULL THEN 'True' ELSE 'False' END AS Finally_Pass,
        CASE WHEN f.wo != d.wo THEN 'True' ELSE 'False' END AS Cross_Wo,
        COALESCE(fc.fail_count, 0) AS Fail_Count
      FROM \`${database}\`.\`${table}\` d
      LEFT JOIN final_status f ON d.sn = f.sn
      LEFT JOIN fail_counts fc ON d.sn = fc.sn
      WHERE d.err_msg IS NOT NULL AND d.tbeg BETWEEN ? AND ? AND d.is_y = 1;`;

    const [rows] = await pool.execute(sql, [from_time, end_time]);
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});


app.get('/mcc_rates', async (req, res) => {
  try {
    const { err_msg, err_id, db: database, table } = req.query;
    const woList = parseWoList(req.query.wo || '');
    if (!err_msg || !err_id || !database || !table) return res.status(400).json({ error: 'Missing required query parameters' });
    if (woList.length === 0) return res.json([]);

    const placeholders = woList.map(() => '?').join(',');
    // Treat err_id as an identifier => sanitize by allowing only alphanum/underscore
    const safeErrId = String(err_id).replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeErrId) return res.status(400).json({ error: 'Invalid err_id' });

    const columnIdentifier = `\`${safeErrId}\``;
    const sql = `SELECT sn, name, tpver FROM \`${database}\`.\`${table}\` WHERE ${columnIdentifier} = ? AND wo IN (${placeholders});`;
    const [rows] = await pool.execute(sql, [String(err_msg).trim(), ...woList]);
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});


app.get('/all', async (req, res) => {
  try {
    const { db: database, table } = req.query;
    const woList = parseWoList(req.query.wo || '');
    if (!database || !table) return res.status(400).json({ error: 'Missing required query parameters' });
    if (woList.length === 0) return res.json([]);

    const cols = await getColumns(database, table);
    const socExpr = buildSocMaxExpression(cols);
    const placeholders = woList.map(() => '?').join(',');

    const sql = `WITH fail_counts AS (
        SELECT sn, COUNT(*) AS fail_count
        FROM \`${database}\`.\`${table}\`
        WHERE err_msg IS NOT NULL AND is_y = 1
        GROUP BY sn
      ), latest_records AS (
        SELECT sn, MAX(tbeg) AS latest_tbeg
        FROM \`${database}\`.\`${table}\`
        WHERE is_y = 1
        GROUP BY sn
      ), final_status AS (
        SELECT t.sn, t.wo, t.err_msg AS latest_err_msg
        FROM \`${database}\`.\`${table}\` t
        JOIN latest_records l ON t.sn = l.sn AND t.tbeg = l.latest_tbeg
      )
      SELECT d.*, ${socExpr},
        CASE WHEN f.latest_err_msg IS NULL THEN 'True' ELSE 'False' END AS Finally_Pass,
        CASE WHEN f.wo != d.wo THEN 'True' ELSE 'False' END AS Cross_Wo,
        COALESCE(fc.fail_count, 0) AS Fail_Count
      FROM \`${database}\`.\`${table}\` d
      LEFT JOIN final_status f ON d.sn = f.sn
      LEFT JOIN fail_counts fc ON d.sn = fc.sn
      WHERE d.err_msg IS NOT NULL AND d.wo IN (${placeholders}) AND d.is_y = 1;`;

    const [rows] = await pool.execute(sql, [...woList]);
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});

app.listen(PORT, HOST, () => console.log(`API running at http://${HOST}:${PORT}`));
