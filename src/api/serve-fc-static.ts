import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, extname, resolve } from "node:path";
import type { ServerResponse } from "node:http";

const FC_ROOT = resolve(process.cwd(), "src/fc");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * 托管消费者端 FC 静态页面（与品牌 Dashboard 完全独立）。
 */
export async function serveFcStatic(
  pathname: string,
  res: ServerResponse,
): Promise<boolean> {
  const tapSnMatch = /^\/tap\/([A-Za-z0-9]+)$/.exec(pathname);
  if (pathname !== "/tap" && !tapSnMatch && !pathname.startsWith("/fc/")) {
    return false;
  }

  let relativePath = pathname;
  if (pathname === "/tap" || tapSnMatch) relativePath = "/index.html";
  else if (pathname.startsWith("/fc/")) relativePath = pathname.slice("/fc".length);

  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(FC_ROOT, safePath);

  if (!filePath.startsWith(FC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
  } catch {
    return false;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (ext === ".html" || ext === ".jsx" || ext === ".js") {
    headers["Cache-Control"] = "no-store";
  }
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
  return true;
}
