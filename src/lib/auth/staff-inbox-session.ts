import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  normalizeStaffEmail,
} from "@/lib/auth/staff-allowlist";

export const STAFF_INBOX_SESSION_COOKIE =
  "ise_staff_inbox_session";
export const STAFF_INBOX_SESSION_TTL_SECONDS =
  8 * 60 * 60;

export interface FirebaseStaffSession {
  authMethod: "firebase";
  email: string;
  name: string | null;
  expiresAt: number;
}

interface SessionPayload {
  version: 1;
  authMethod: "firebase";
  email: string;
  name: string | null;
  expiresAt: number;
}

interface SessionOptions {
  secret?: string;
  now?: () => number;
}

function getSessionSecret(
  override?: string,
): string | null {
  const secret = (
    override ??
    process.env.STAFF_AUTH_SESSION_SECRET
  )?.trim();

  return secret && secret.length >= 32
    ? secret
    : null;
}

function signPayload(
  encodedPayload: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(
      `ise-staff-inbox:${encodedPayload}`,
      "utf8",
    )
    .digest("base64url");
}

function safeEqual(
  left: string,
  right: string,
): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length ===
    rightBuffer.length &&
    timingSafeEqual(
      leftBuffer,
      rightBuffer,
    );
}

function readCookie(
  request: Request,
  name: string,
): string | undefined {
  const header =
    request.headers.get("cookie");
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] =
      part.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(
          rawValue.join("="),
        );
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function normalizeDisplayName(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim();
  return name
    ? name.slice(0, 200)
    : null;
}

export function createFirebaseStaffSessionToken(
  input: {
    email: string;
    name?: string | null;
  },
  options: SessionOptions = {},
): string {
  const secret = getSessionSecret(
    options.secret,
  );
  const email = normalizeStaffEmail(
    input.email,
  );

  if (!secret) {
    throw new Error(
      "STAFF_AUTH_SESSION_SECRET must contain at least 32 characters",
    );
  }
  if (!email) {
    throw new Error(
      "A valid staff email is required",
    );
  }

  const now = Math.floor(
    (options.now?.() ?? Date.now()) /
      1000,
  );
  const payload: SessionPayload = {
    version: 1,
    authMethod: "firebase",
    email,
    name: normalizeDisplayName(
      input.name,
    ),
    expiresAt:
      now +
      STAFF_INBOX_SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  return `${encodedPayload}.${signPayload(
    encodedPayload,
    secret,
  )}`;
}

export function readFirebaseStaffSession(
  request: Request,
  options: SessionOptions = {},
): FirebaseStaffSession | null {
  const secret = getSessionSecret(
    options.secret,
  );
  const token = readCookie(
    request,
    STAFF_INBOX_SESSION_COOKIE,
  );

  if (!secret || !token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, signature] =
    parts;
  if (
    !encodedPayload ||
    !signature ||
    !safeEqual(
      signature,
      signPayload(
        encodedPayload,
        secret,
      ),
    )
  ) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(
        encodedPayload,
        "base64url",
      ).toString("utf8"),
    );
  } catch {
    return null;
  }

  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const candidate = payload as Record<
    string,
    unknown
  >;
  const email = normalizeStaffEmail(
    candidate.email,
  );
  const now = Math.floor(
    (options.now?.() ?? Date.now()) /
      1000,
  );

  if (
    candidate.version !== 1 ||
    candidate.authMethod !==
      "firebase" ||
    !email ||
    !Number.isSafeInteger(
      candidate.expiresAt,
    ) ||
    (candidate.expiresAt as number) <=
      now
  ) {
    return null;
  }

  return {
    authMethod: "firebase",
    email,
    name: normalizeDisplayName(
      candidate.name,
    ),
    expiresAt:
      candidate.expiresAt as number,
  };
}

export function buildFirebaseStaffSessionCookie(
  token: string,
): string {
  const secure =
    process.env.NODE_ENV ===
    "production"
      ? "; Secure"
      : "";

  return [
    `${STAFF_INBOX_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${STAFF_INBOX_SESSION_TTL_SECONDS}`,
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildExpiredFirebaseStaffSessionCookie():
  string {
  const secure =
    process.env.NODE_ENV ===
    "production"
      ? "; Secure"
      : "";

  return [
    `${STAFF_INBOX_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}
