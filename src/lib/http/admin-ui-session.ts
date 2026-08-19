import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  env,
} from "@/core/config/env";

export const ADMIN_UI_SESSION_COOKIE =
  "ise_admin_ui_session";

const SESSION_TTL_SECONDS =
  8 * 60 * 60;

function sign(
  expiresAt: string,
): string {
  return createHmac(
    "sha256",
    env.APP_API_KEY,
  )
    .update(
      `ise-admin-ui:${expiresAt}`,
      "utf8",
    )
    .digest("base64url");
}

function safeEqual(
  left: string,
  right: string,
): boolean {
  const leftBuffer =
    Buffer.from(left);
  const rightBuffer =
    Buffer.from(right);

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}

function readCookie(
  request: Request,
  name: string,
): string | undefined {
  const cookieHeader =
    request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (
    const part of cookieHeader.split(";")
  ) {
    const [rawName, ...rawValue] =
      part.trim().split("=");

    if (rawName === name) {
      return decodeURIComponent(
        rawValue.join("="),
      );
    }
  }

  return undefined;
}

export function createAdminUiSessionToken():
  string {
  const expiresAt = String(
    Math.floor(Date.now() / 1000) +
      SESSION_TTL_SECONDS,
  );

  return `${expiresAt}.${sign(expiresAt)}`;
}

export function hasValidAdminUiSession(
  request: Request,
): boolean {
  const token = readCookie(
    request,
    ADMIN_UI_SESSION_COOKIE,
  );

  if (!token) {
    return false;
  }

  const [expiresAt, signature] =
    token.split(".");

  if (
    !expiresAt ||
    !signature ||
    !/^\d+$/.test(expiresAt)
  ) {
    return false;
  }

  const expiresAtSeconds =
    Number(expiresAt);

  if (
    !Number.isSafeInteger(
      expiresAtSeconds,
    ) ||
    expiresAtSeconds <=
      Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return safeEqual(
    signature,
    sign(expiresAt),
  );
}

export function buildAdminUiSessionCookie(
  token: string,
): string {
  const secure =
    process.env.NODE_ENV ===
    "production"
      ? "; Secure"
      : "";

  return [
    `${ADMIN_UI_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildExpiredAdminUiSessionCookie():
  string {
  const secure =
    process.env.NODE_ENV ===
    "production"
      ? "; Secure"
      : "";

  return [
    `${ADMIN_UI_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}
