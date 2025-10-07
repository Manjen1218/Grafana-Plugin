import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();
const MOUNT_ROOT = '/home/template/remote_mount';

function findMatchingDir(basePath, searchPart) {
  const entries = fs.readdirSync(basePath, { withFileTypes: true });
  const normalizedSearch = searchPart.replace(/[^a-z0-9]/gi, '').toLowerCase();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const normalizedEntry = entry.name.replace(/[^a-z0-9]/gi, '').toLowerCase();

    if (normalizedEntry.toLowerCase().endsWith(normalizedSearch)) {
      return path.join(basePath, entry.name);
    }
  }

  return null;
}

function findFileInDir(dir, namePart) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name === namePart) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

async function findFileByParams({ rootDir, sku, ts, date, name }) {
  let currentPath = rootDir;
  const skuModel = sku.replace(/-/g, '_');
  const dateExtract = decodeURIComponent(date).split(/[T ]/)[0].replace(/-/g, '');
  const status = name.split('_')[1];

  const pathParts = [skuModel, ts, dateExtract, status];

  for (const part of pathParts) {
    currentPath = findMatchingDir(currentPath, part.toLowerCase());
    if (!currentPath) return null;
  }

  // Now look for the file in the final dir
  const filePath = findFileInDir(currentPath, name);
  return filePath || null;
}

router.get('/log-matcher', async (req, res) => {
  const { sku, ts, date, name } = req.query;

  // Validate parameters
  if (![sku, ts, date, name].every(p => typeof p === 'string')) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  try {
    const filePath = await findFileByParams({
      rootDir: MOUNT_ROOT,
      sku,
      ts,
      date,
      name
    });

    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ filePath });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;
