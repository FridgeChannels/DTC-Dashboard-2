import type { IncomingMessage, ServerResponse } from "node:http";

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function json(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

export function errorJson(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  json(res, status, { error: message });
}

export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (
      (err.message === "fetch failed" || err.message === "Failed to fetch") &&
      cause &&
      typeof cause === "object" &&
      "message" in cause &&
      typeof (cause as { message: unknown }).message === "string"
    ) {
      return `Upstream request failed: ${(cause as { message: string }).message}`;
    }
    return err.message;
  }
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}
