import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import cors from 'cors';
import pLimit from 'p-limit';
import zlib from 'zlib';
import tarStream from 'tar-stream';
import { pipeline } from 'stream/promises';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const MOUNT_ROOT = '/mnt/FTP_log/';

app.post("/download_multi_sn_stream", async (req, res) => {
  const MAX_CONCURRENT_FILES = 20; // higher concurrency, tune for your disk/network

  let pack = null;
  let gzip = null;

  try {
    const { db, files } = req.body;
    console.log(
      "Request body received:",
      JSON.stringify({ db, files: files ? Object.keys(files) : "none" })
    );

    if (!db || !files || typeof files !== "object") {
      return res.status(400).send("Invalid request body");
    }

    // Flatten file entries
    const allFileEntries = [];
    for (const [sn, filePaths] of Object.entries(files)) {
      for (const fullpath of filePaths) {
        allFileEntries.push({ sn, fullpath });
      }
    }

    const totalFiles = allFileEntries.length;
    console.log(`Starting tar creation for ${totalFiles} files.`);

    if (totalFiles === 0) {
      return res.status(400).send("No valid files to download.");
    }

    // Set headers
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${db}_download.tar.gz"`
    );
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Create tar + gzip streams
    pack = tarStream.pack();
    gzip = zlib.createGzip();

    const streamPipeline = pipeline(pack, gzip, res).catch((err) => {
      console.error("Stream pipeline error:", err);
    });

    // Handle client disconnect
    const controller = new AbortController();
    const { signal } = controller;

    res.on("close", () => {
      if (!signal.aborted) {
        console.log("Client closed connection, aborting.");
        controller.abort();
      }
    });

    // Helper to add files to tar
    const addFileToTar = async ({ sn, fullpath }) => {
      if (signal.aborted) throw new Error("Request aborted by client");

      try {
        const stats = await fs.stat(fullpath);
        if (!stats.isFile()) {
          console.warn(`Not a file: ${fullpath}`);
          return;
        }

        const filename = path.basename(fullpath);

        return new Promise((resolve, reject) => {
          const entry = pack.entry(
            {
              name: path.join(sn, filename),
              size: stats.size,
              mode: stats.mode,
              mtime: stats.mtime,
            },
            (err) => {
              if (err) reject(err);
            }
          );

          if (!entry) return resolve();

          const fileStream = fs.createReadStream(fullpath);
          fileStream
            .pipe(entry)
            .on("finish", resolve)
            .on("error", reject);
        });
      } catch (error) {
        console.error(`Error processing file ${fullpath}:`, error);
      }
    };

    // Run with concurrency control
    const limit = pLimit(MAX_CONCURRENT_FILES);
    await Promise.all(allFileEntries.map((f) => limit(() => addFileToTar(f))));

    console.log("All files processed. Finalizing tar.");
    pack.finalize();

    await streamPipeline;
    console.log(`Download completed successfully for ${totalFiles} files.`);
  } catch (err) {
    console.error("Error in download stream:", err);

    if (pack) pack.destroy();
    if (gzip) gzip.destroy();

    if (!res.headersSent) {
      res.status(500).send("Internal server error: " + err.message);
    } else {
      res.end();
    }
  }
});

app.listen(PORT, '192.168.50.201', () => {
    console.log(`File download service running at http://192.168.50.201:${PORT}`);
});
