import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPath, {
      index: false,
      etag: true,
      maxAge: "30d",
      immutable: true,
      setHeaders: (res, filePath) => {
        // Keep HTML fresh, cache fingerprinted assets aggressively.
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
