import { timingSafeEqual } from "node:crypto";
import { env } from "@/core/config/env";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidApiKey(request: Request): boolean {
  const provided = request.headers.get("x-api-key");
  return Boolean(provided && safeEqual(provided, env.APP_API_KEY));
}
