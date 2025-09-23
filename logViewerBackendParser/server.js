import express from 'express';
import parseLogRoute from './testParser.js';
import logFilesRoute from './logFilesRoute.js'
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 5000;

app.use(cors()); // allow React dev server to fetch from here
app.use('/api', parseLogRoute);
app.use('/api', logFilesRoute);

app.get('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;

  // Sanitize filename to prevent directory traversal attacks
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).send('Invalid filename');
  }

  const baseDir = path.resolve('../react_log_display/public'); // Only allow files in this dir
  const requestedPath = path.resolve(baseDir, filename);  
  
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

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
