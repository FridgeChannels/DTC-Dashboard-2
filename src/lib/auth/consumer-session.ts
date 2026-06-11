import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { appendSetCookies, readCookie, serializeCookie } from "../supabase/cookies.js";

const COOKIE_NAME = "fc_consumer_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function setConsumerSessionCookie(
  res: ServerResponse,
  fcUserId: string,
): void {
  appendSetCookies(res, [
    serializeCookie(COOKIE_NAME, fcUserId, {
      path: "/",
      maxAge: MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
    }),
  ]);
}

export function clearConsumerSessionCookie(res: ServerResponse): void {
  appendSetCookies(res, [
    serializeCookie(COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    }),
  ]);
}

export function readConsumerSessionFcUserId(req: IncomingMessage): string | undefined {
  return readCookie(req, COOKIE_NAME);
}

export function generateFcUserId(): string {
  return randomUUID();
}
