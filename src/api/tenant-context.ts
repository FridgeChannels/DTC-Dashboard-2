import type { IncomingMessage, ServerResponse } from "node:http";
import { getCurrentCustomer } from "../lib/auth/getCurrentCustomer.js";
import { AuthError } from "../lib/auth/errors.js";
import type { CurrentCustomer } from "../lib/auth/types.js";

const READONLY_CONFIG_CUSTOMER_ID = 5;

function customerStatus(current: CurrentCustomer): number {
  return Number(current.customer.status);
}

function isReadonlyConfigStatus(status: number): boolean {
  return status === 2 || status === 3;
}

function readonlyError(): AuthError {
  return new AuthError("This account is read-only");
}

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

/**
 * 配置/后台展示读取用 customer_id：
 * - status=1：读取当前登录 customer
 * - status=2/3：读取固定 demo customer=5
 */
export async function getRequestConfigCustomerId(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<number> {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    throw new AuthError("Unauthorized");
  }
  return isReadonlyConfigStatus(customerStatus(current))
    ? READONLY_CONFIG_CUSTOMER_ID
    : Number(current.customer.id);
}

/**
 * Brand Info 页面读取/保存用 customer_id：
 * - status=1/3：读取并保存当前登录 customer
 * - status=2：只读 demo customer=5
 */
export async function getRequestBrandInfoCustomerId(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<number> {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    throw new AuthError("Unauthorized");
  }
  return customerStatus(current) === 2
    ? READONLY_CONFIG_CUSTOMER_ID
    : Number(current.customer.id);
}

export async function getRequestBrandInfoContext(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{
  customerId: number;
  status: number;
  customerScopedBrandInfo: boolean;
}> {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    throw new AuthError("Unauthorized");
  }
  const status = customerStatus(current);
  return {
    customerId:
      status === 2 ? READONLY_CONFIG_CUSTOMER_ID : Number(current.customer.id),
    status,
    customerScopedBrandInfo: status === 3,
  };
}

export async function assertRequestCanWriteConfig(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    throw new AuthError("Unauthorized");
  }
  if (customerStatus(current) !== 1) {
    throw readonlyError();
  }
}

export async function assertRequestCanWriteBrandInfo(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    throw new AuthError("Unauthorized");
  }
  const status = customerStatus(current);
  if (status !== 1 && status !== 3) {
    throw readonlyError();
  }
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
