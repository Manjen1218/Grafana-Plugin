import express from 'express';
import path from 'path';
import fs from 'fs';
import { verifyFileToken, createFileToken } from './.jwtUtils.js';

const router = express.Router();
const MOUNT_ROOT = '/home/template/remote_mount';

router.post('/create-mcc-token', (req, res) => {
  const { filePath } = req.body;

  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).send('Invalid file path');
  }

  const token = createFileToken(filePath);
  res.json({ token });
});

router.get('/mcc-log', (req, res) => {
  const { token } = req.query;

  let decoded;
  try {
    decoded = verifyFileToken(token);
  } catch (err) {
    return res.status(403).send('Invalid or expired token');
  }

  let filepath = decoded.filePath;
  try {
    filepath = decodeURIComponent(filepath); // decode %2F into '/'
  } catch (e) {
    return res.status(400).send('Invalid URL encoding');
  }

  // Sanitize filename to prevent directory traversal attacks
  if (filepath.includes('..')) {
    return res.status(400).send('Invalid filename');
  }

  const parts = filepath.split('/').filter(Boolean); // filter to remove any empty strings

  // Make sure there are enough parts to process
  if (parts.length < 6) {
    return res.status(400).send('Invalid file path format');
  }

  // Replace first two elements with MOUNT_ROOT
  const modifiedPathParts = [MOUNT_ROOT, ...parts.slice(3)];

  modifiedPathParts[3] = modifiedPathParts[3] + '-MCC';

  // Replace the extension of the final part
  const last = modifiedPathParts[modifiedPathParts.length - 1];
  modifiedPathParts[modifiedPathParts.length - 1] = last.replace(/\.cap$/, '.mcc');

  const requestedPath = path.join(...modifiedPathParts);
  
  fs.access(requestedPath, fs.constants.R_OK, (err) => {
    if (err) {
      return res.status(404).send('Log file not found');
    }

    // Set the content type to plain text so browser renders it
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    const readStream = fs.createReadStream(requestedPath);
    readStream.pipe(res);
  });
});


export default router;