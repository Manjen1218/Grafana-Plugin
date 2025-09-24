const mysql = require('mysql2/promise');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const HOST = 0; //server.js backend private host ip
const PORT = 0; // server.js backend port

const pool = mysql.createPool({
    host: '', // SQL server host
    port: 0, // SQL server port
    user: '', // Username 
    password: '', // Password
    timezone: 'Z'
});

app.get('/wo_table', async (req, res) => {
  const errMsgRaw = req.query.err_msg;
  const errId = req.query.err_id;
  const database = req.query.db;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean); 

  let errMsg = errMsgRaw.trim();

  const placeholders = woList.map(() => '?').join(', ');

  const socMaxTempCols = [
    'critical_temp_max',
    'mcf_soc_t_max',
    'hpl_soc_t_max',
    'berg5_soc_t_max',
    'soc_temp_max'
  ];

  const [columns] = await pool.execute(`SHOW COLUMNS FROM \`${database}\`.\`${table}\``);
  const availableCols = columns
    .map(col => col.Field)
    .filter(field => socMaxTempCols.includes(field));

  let socMaxExpr = 'NULL as soc_max_t';
  if (availableCols.length > 0) {
    socMaxExpr = `
      NULLIF(
        GREATEST(${availableCols.map(col => `IFNULL(d.${col}, -999)`).join(', ')}), 
        -999
      ) AS soc_max_t
    `;
  }
  
  const sql = `
    WITH fail_counts AS (
      SELECT sn, COUNT(*) AS fail_count
      FROM \`${database}\`.\`${table}\`
      WHERE err_msg IS NOT NULL AND is_y = 1
      GROUP BY sn
    ),
    latest_records AS (
      SELECT sn,
            MAX(tbeg) AS latest_tbeg
      FROM \`${database}\`.\`${table}\`
      WHERE is_y = 1
      GROUP BY sn
    ),
    final_status AS (
      SELECT t.sn,
            t.wo, 
            t.err_msg AS latest_err_msg
      FROM \`${database}\`.\`${table}\` t
      JOIN latest_records l ON t.sn = l.sn AND t.tbeg = l.latest_tbeg
    )
    SELECT 
      d.*, 
      ${socMaxExpr},
      CASE 
        WHEN f.latest_err_msg IS NULL THEN 'True' 
        ELSE 'False' 
      END AS Finally_Pass,
      CASE 
        WHEN f.wo != d.wo THEN 'True' 
        ELSE 'False' 
      END AS Cross_Wo, 
      COALESCE(fc.fail_count, 0) AS Fail_Count
    FROM \`${database}\`.\`${table}\` d
    LEFT JOIN final_status f ON d.sn = f.sn
    LEFT JOIN fail_counts fc ON d.sn = fc.sn
    WHERE d.err_msg = ?
      AND d.err_id = ?
      AND d.wo IN (${placeholders}) 
      AND d.is_y = 1;
    `;

  const [rows] = await pool.execute(sql, [errMsg, errId, ...woList]);
  res.json(rows);
});

app.get('/sku_table', async (req, res) => {
  const errMsgRaw = req.query.err_msg;
  const err_id = req.query.err_id;
  const database = req.query.db;
  const table = req.query.table;
  const fromTime = req.query.from_time;
  const toTime = req.query.end_time;

  let errMsg = errMsgRaw.trim();

  const socMaxTempCols = [
    'critical_temp_max',
    'mcf_soc_t_max',
    'hpl_soc_t_max',
    'berg5_soc_t_max',
    'soc_temp_max'
  ];

  const [columns] = await pool.execute(`SHOW COLUMNS FROM \`${database}\`.\`${table}\``);
  const availableCols = columns
    .map(col => col.Field)
    .filter(field => socMaxTempCols.includes(field));

  let socMaxExpr = 'NULL as soc_max_t';
  if (availableCols.length > 0) {
    socMaxExpr = `
      NULLIF(
        GREATEST(${availableCols.map(col => `IFNULL(d.${col}, -999)`).join(', ')}), 
        -999
      ) AS soc_max_t
    `;
  }
  
  const sql = `
    WITH fail_counts AS (
      SELECT sn, COUNT(*) AS fail_count
      FROM \`${database}\`.\`${table}\`
      WHERE err_msg IS NOT NULL AND is_y = 1
      GROUP BY sn
    ),
    latest_records AS (
      SELECT sn,
            MAX(tbeg) AS latest_tbeg
      FROM \`${database}\`.\`${table}\`
      WHERE is_y = 1
      GROUP BY sn
    ),
    final_status AS (
      SELECT t.sn,
            t.wo, 
            t.err_msg AS latest_err_msg
      FROM \`${database}\`.\`${table}\` t
      JOIN latest_records l ON t.sn = l.sn AND t.tbeg = l.latest_tbeg
    )
    SELECT 
      d.*, 
      ${socMaxExpr},
      CASE 
        WHEN f.latest_err_msg IS NULL THEN 'True' 
        ELSE 'False' 
      END AS Finally_Pass,
      CASE 
        WHEN f.wo != d.wo THEN 'True' 
        ELSE 'False' 
      END AS Cross_Wo,
      COALESCE(fc.fail_count, 0) AS Fail_Count
    FROM \`${database}\`.\`${table}\` d
    LEFT JOIN final_status f ON d.sn = f.sn
    LEFT JOIN fail_counts fc ON d.sn = fc.sn
    WHERE d.err_msg = ?
      AND d.err_id = ?
      AND d.tbeg BETWEEN ? AND ?
      AND d.is_y = 1;
    `;

  const [rows] = await pool.execute(sql, [errMsg, err_id, fromTime, toTime]);
  res.json(rows);
});

app.get('/mcc_rates', async (req, res) => {
  console.log("USING MCC_RATES");
  const errMsgRaw = req.query.err_msg;
  const errId = req.query.err_id;
  const database = req.query.db;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')     // Remove the curly braces
    .split(',')               // Split by commas
    .map(w => w.trim())       // Trim whitespace
    .filter(Boolean); 

  let errMsg = errMsgRaw.trim();

  const placeholders = woList.map(() => '?').join(', ');

  const sql = `
    SELECT sn, bname, tpver, mcc_check_time, mcc_check, mcc_upload_time, mcc_upload 
    FROM \`${database}\`.\`${table}\` 
    WHERE \`${errId}\` = ?
    AND wo IN (${placeholders})`;

  const [rows] = await pool.execute(sql, [errMsg, ...woList]);
  res.json(rows);
});

app.get('/all', async (req, res) => {
  const database = req.query.db;
  const table = req.query.table;
  const woName = req.query.woName;
  const woEncoded = req.query.wo || '';

  const woList = decodeURIComponent(woEncoded)
    .replace(/[{}]/g, '')
    .split(',')
    .map(w => w.trim())
    .filter(Boolean); 

  const placeholders = woList.map(() => '?').join(', ');

  const socMaxTempCols = [
    'critical_temp_max',
    'mcf_soc_t_max',
    'hpl_soc_t_max',
    'berg5_soc_t_max',
    'soc_temp_max'
  ];

  const [columns] = await pool.execute(`SHOW COLUMNS FROM \`${database}\`.\`${table}\``);
  const availableCols = columns
    .map(col => col.Field)
    .filter(field => socMaxTempCols.includes(field));

  let socMaxExpr = 'NULL as soc_max_t';
  if (availableCols.length > 0) {
    socMaxExpr = `
      NULLIF(
        GREATEST(${availableCols.map(col => `IFNULL(d.${col}, -999)`).join(', ')}), 
        -999
      ) AS soc_max_t
    `;
  }
  
  const sql = `
    WITH fail_counts AS (
      SELECT sn, COUNT(*) AS fail_count
      FROM \`${database}\`.\`${table}\`
      WHERE err_msg IS NOT NULL AND is_y = 1
      GROUP BY sn
    ),
    latest_records AS (
      SELECT sn,
            MAX(tbeg) AS latest_tbeg
      FROM \`${database}\`.\`${table}\`
      WHERE is_y = 1
      GROUP BY sn
    ),
    final_status AS (
      SELECT t.sn,
            t.wo, 
            t.err_msg AS latest_err_msg
      FROM \`${database}\`.\`${table}\` t
      JOIN latest_records l ON t.sn = l.sn AND t.tbeg = l.latest_tbeg
    )
    SELECT 
      d.*, 
      ${socMaxExpr},
      CASE 
        WHEN f.latest_err_msg IS NULL THEN 'True' 
        ELSE 'False' 
      END AS Finally_Pass,
      CASE 
        WHEN f.wo != d.wo THEN 'True' 
        ELSE 'False' 
      END AS Cross_Wo,
      COALESCE(fc.fail_count, 0) AS Fail_Count
    FROM \`${database}\`.\`${table}\` d
    LEFT JOIN final_status f ON d.sn = f.sn
    LEFT JOIN fail_counts fc ON d.sn = fc.sn
    WHERE d.err_msg IS NOT NULL AND d.wo IN (${placeholders}) AND d.is_y = 1;
    `;

  const [rows] = await pool.execute(sql, [...woList]);
  res.json(rows);
});

app.listen(PORT, () => console.log(`API running at http://${HOST}:${PORT}`));
