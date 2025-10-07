import { Router } from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const router = Router();
router.use(cors()); // optional if you're accessing from a frontend

async function getConnection(database) {
  return await mysql.createConnection({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: database,
    timezone: 'Z'
  });
}

// GET /yield-rate?db=<db>&ts=<ts>&wo=<wo>
router.get('/yield-rate', async (req, res) => {
  const { db, ts, wo } = req.query;

  if (!db || !ts || !wo) {
    return res.status(400).json({ error: 'Missing required query parameters: db, ts, or wo' });
  }

  let connection;
  try {
    // Use the requested database
    connection = await getConnection(db)

    // Example SQL query - update this to fit your schema
    const [rows] = await connection.execute(
      `SELECT 
         COUNT(DISTINCT CASE WHEN latest_rn = 1 AND err_msg IS NULL THEN sn END) AS pass_count,
         COUNT(DISTINCT CASE WHEN latest_rn = 1 AND err_msg IS NOT NULL THEN sn END) AS fail_count,
         COUNT(DISTINCT sn) AS total_sn,
         ROUND(100.0 * COUNT(DISTINCT CASE WHEN first_rn = 1 AND err_msg IS NULL THEN sn END) / COUNT(DISTINCT sn), 2) AS FPY, 
         ROUND(100.0 * COUNT(DISTINCT CASE WHEN latest_rn = 1 AND err_msg IS NULL THEN sn END) / COUNT(DISTINCT sn), 2) AS final_yield_rate 
       FROM (
         SELECT 
           wo,
           sn,
           err_msg,
           tbeg,
           ROW_NUMBER() OVER (PARTITION BY wo, sn ORDER BY tbeg ASC) AS first_rn, 
           ROW_NUMBER() OVER (PARTITION BY wo, sn ORDER BY tbeg DESC) AS latest_rn
         FROM \`${ts}\`
         WHERE wo = ? AND is_y = 1
         ) combined
       `,
      [wo]
    );

    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Query Error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

router.get('/err_distribution', async (req, res) => {
  const { db, ts, wo } = req.query;

  if (!db || !ts || !wo) {
    return res.status(400).json({ error: 'Missing required query parameters: db, ts, or wo' });
  }

  let connection;
  try {
    // Use the requested database
    connection = await getConnection(db)

    // Example SQL query - update this to fit your schema
    const [rows] = await connection.execute(
      `CALL admin.get_error_distribution_wo_history_table(?, ?, ?)`,
      [db, ts, wo]
    );

    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Query Error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

router.get('/jig_temps', async (req, res) => {
  const { db, ts, wo } = req.query;

  if (!db || !ts || !wo) {
    return res.status(400).json({ error: 'Missing required query parameters: db, ts, or wo' });
  }

  let connection;
  try {
    connection = await getConnection(db)

    const [rows] = await connection.execute(
      `CALL admin.get_jig_yield_summary_wo(?, ?, ?)`,
      [db, wo, ts]
    );

    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Query Error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

router.get('/rpi_temps', async (req, res) => {
  const { db, ts, wo } = req.query;

  if (!db || !ts || !wo) {
    return res.status(400).json({ error: 'Missing required query parameters: db, ts, or wo' });
  }

  let connection;
  try {
    connection = await getConnection(db)

    const [rows] = await connection.execute(
      `CALL admin.get_rpi_yield_summary_wo(?, ?, ?)`,
      [db, wo, ts]
    );

    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Query Error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

export default router;