import express from 'express';
import parseLogRoute from './testParser.js';
import logFilesRoute from './logFilesRoute.js';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use('/api', parseLogRoute);
app.use('/api', logFilesRoute);

app.get('/api/files/:filename', async (req, res) => {
  const filename = String(req.params.filename || '');
  if (!filename || filename.includes('..') || filename.includes('/')) return res.status(400).send('Invalid filename');
  const baseDir = path.resolve(process.cwd(), '..', 'react_log_display', 'public');
  const requested = path.resolve(baseDir, filename);
  if (!requested.startsWith(baseDir)) return res.status(400).send('Invalid filename');
  try {
    const stat = await fs.stat(requested);
    if (!stat.isFile()) return res.status(404).send('File not found');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(requested)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(requested).pipe(res);
  } catch (err) {
    return res.status(404).send('File not found');
  }
});

app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`));
