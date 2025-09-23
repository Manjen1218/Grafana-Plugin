import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/parsed-test-log', (req, res) => {
  const { filepath } = req.query;

  if (!filepath || typeof filepath !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid filepath parameter' });
  }

  const baseDir = path.resolve('../react_log_display/public'); // Only allow files in this dir
  const requestedPath = path.resolve(baseDir, filepath);       // Prevent path traversal

  // Security check to ensure user can't access outside baseDir
  if (!requestedPath.startsWith(baseDir)) {
    return res.status(403).json({ error: 'Access denied: invalid path' });
  }

  // Optional: check if file exists
  if (!fs.existsSync(requestedPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const scriptPath = path.resolve('./testCaseParser.py');

  execFile('python3', [scriptPath, requestedPath], (error, stdout, stderr) => {
    if (error) {
      console.error('Error running Python script:', error);
      return res.status(500).json({ error: 'Log parsing failed' });
    }

    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (e) {
      console.error('Invalid JSON output from parser:', e);
      res.status(500).json({ error: 'Invalid JSON output from parser' });
    }
  });
});

export default router;
