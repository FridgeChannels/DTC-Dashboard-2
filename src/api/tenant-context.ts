import type { IncomingMessage } from "node:http";
import { env } from "../config/env.js";

/**
 * 当前项目还没有登录/session 中间件。
 * 多租户上线时，只需要在这里从已认证的 session/JWT 解析 customer_id，
 * 业务 API 不应信任前端传入的 customerId。
 */
export function getRequestCustomerId(_req: IncomingMessage): number {
  return env.defaultCustomerId;
}
