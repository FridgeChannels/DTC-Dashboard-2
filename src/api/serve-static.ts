import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, extname, resolve } from "node:path";
import type { ServerResponse } from "node:http";

const DASHBOARD_ROOT = resolve(process.cwd(), "src/dashboard");

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
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * 托管 dashboard 静态前端，使 API 与前端共用同一个服务/端口。
 * 返回 true 表示已处理该请求。
 */
export async function serveStatic(
  pathname: string,
  res: ServerResponse,
): Promise<boolean> {
  let relativePath = pathname;
  if (pathname === "/login") relativePath = "/login.html";
  else if (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname === "/brand-config" ||
    pathname === "/segment-config" ||
    pathname === "/survey-campaigns"
  ) relativePath = "/admin.html";
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(DASHBOARD_ROOT, safePath);

  if (!filePath.startsWith(DASHBOARD_ROOT)) {
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
