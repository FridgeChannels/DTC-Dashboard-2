import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import type { ServerResponse } from "node:http";

const REORDER_ROOT = resolve(process.cwd(), "src/reorder-dashboard");

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
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isAssetPath(pathname: string): boolean {
  return pathname.startsWith("/reorder/assets/")
    || pathname.startsWith("/reorder/components/");
}

export async function serveReorderStatic(
  pathname: string,
  res: ServerResponse,
): Promise<boolean> {
  if (pathname !== "/reorder" && !pathname.startsWith("/reorder/")) {
    return false;
  }

  const relativePath = isAssetPath(pathname)
    ? pathname.slice("/reorder".length)
    : "/index.html";
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(REORDER_ROOT, safePath);

  if (!filePath.startsWith(REORDER_ROOT)) {
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
  const headers: Record<string, string> = {
    "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
  };
  if ([".html", ".jsx", ".js"].includes(ext)) {
    headers["Cache-Control"] = "no-store";
  }
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
  return true;
}
