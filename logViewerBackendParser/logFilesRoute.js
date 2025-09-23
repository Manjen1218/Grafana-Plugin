// logFilesRoute.js
import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const logsDir = path.resolve('../react_log_display/public/'); // adjust this to your actual log folder

router.get('/logs/:filename', (req, res) => {
  const { filename } = req.params;

  // 🛡️ Basic security check: prevent path traversal
  if (filename.includes('..')) {
    return res.status(400).send('Invalid file path');
  }

  const filePath = path.join(logsDir, filename);

  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      return res.status(404).send('Log file not found');
    }
    res.sendFile(filePath);
  });
});

export default router;
