import type { IncomingMessage, ServerResponse } from "node:http";
import { getCurrentCustomer } from "../lib/auth/getCurrentCustomer.js";
import { AuthError } from "../lib/auth/errors.js";

/**
 * 从已登录 Session 解析当前品牌 customer_id。
 * 禁止信任前端传入的 customerId。
 */
export async function getRequestCustomerId(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<number> {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    throw new AuthError("Unauthorized");
  }
  return Number(current.customer.id);
}

export async function requireCurrentCustomer(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    throw new AuthError("Unauthorized");
  }
  return current;
}
