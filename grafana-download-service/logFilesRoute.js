// logFilesRoute.js
import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const MOUNT_ROOT = '/home/template/remote_mount';

router.get('/logs', (req, res) => {
  const { filename } = req.query;

  // 🛡️ Basic security check: prevent path traversal
  if (filename.includes('..')) {
    return res.status(400).send('Invalid file path');
  }

  const filePath = filename.replace(/^\/your\/folder/, MOUNT_ROOT);

  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      return res.status(404).send('Log file not found');
    }
    res.sendFile(filePath);
  });
});

export default router;
