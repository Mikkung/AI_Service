import {
  z,
} from "zod";

import {
  isAllowedStaffEmail,
  normalizeStaffEmail,
} from "@/lib/auth/staff-allowlist";
import {
  buildFirebaseStaffSessionCookie,
  createFirebaseStaffSessionToken,
} from "@/lib/auth/staff-inbox-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  idToken: z
    .string()
    .trim()
    .min(1)
    .max(20_000),
}).strict();

interface VerifiedFirebaseToken {
  email?: string;
  name?: string;
}

type VerifyIdToken = (
  idToken: string,
) => Promise<VerifiedFirebaseToken>;

interface ProjectConsistency {
  configuredProjectId: string;
  appProjectId?: string;
  credentialProjectId?: string;
  consistent: boolean;
}

interface FirebaseStaffSessionHandlerOptions {
  verifyIdToken?: VerifyIdToken;
  getProjectConsistency?: () => Promise<
    ProjectConsistency
  >;
  logError?: (
    message: string,
    metadata: Record<string, string>,
  ) => void;
}

function safeDiagnosticValue(
  value: unknown,
): string | undefined {
  return typeof value === "string" &&
    /^[a-z0-9._:/-]{1,160}$/i.test(value)
    ? value
    : undefined;
}

const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 300;

function sanitizeDiagnosticMessage(
  value: unknown,
  sensitiveValues: string[] = [],
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  let sanitized = value;
  for (const sensitiveValue of
    sensitiveValues) {
    if (sensitiveValue.length > 0) {
      sanitized = sanitized.replaceAll(
        sensitiveValue,
        "[REDACTED]",
      );
    }
  }

  sanitized = sanitized
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi,
      "[REDACTED]",
    )
    .replace(
      /("(?:private_key|privateKey|client_email|clientEmail|FIREBASE_SERVICE_ACCOUNT_B64|APP_API_KEY|STAFF_AUTH_SESSION_SECRET)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[REDACTED]"',
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[REDACTED]",
    )
    .replace(
      /\b[A-Za-z0-9+/_=-]{40,}\b/g,
      "[REDACTED]",
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[REDACTED]",
    )
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return sanitized.length > 0
    ? sanitized.slice(
        0,
        MAX_DIAGNOSTIC_MESSAGE_LENGTH,
      )
    : undefined;
}

function getSensitiveDiagnosticValues(
  idToken: string,
): string[] {
  return [
    idToken,
    process.env
      .FIREBASE_SERVICE_ACCOUNT_B64,
    process.env.APP_API_KEY,
    process.env
      .STAFF_AUTH_SESSION_SECRET,
  ].filter(
    (value): value is string =>
      typeof value === "string" &&
      value.length > 0,
  );
}

export function getSafeFirebaseAdminErrorMetadata(
  error: unknown,
  projectId: string,
  sensitiveValues: string[] = [],
): Record<string, string> {
  const candidate =
    error !== null &&
    typeof error === "object"
      ? error as Record<string, unknown>
      : {};
  const metadata: Record<string, string> = {
    projectId,
  };
  const code = safeDiagnosticValue(
    candidate.code,
  );
  const name = safeDiagnosticValue(
    candidate.name,
  );
  const message = sanitizeDiagnosticMessage(
    candidate.message,
    sensitiveValues,
  );

  if (code) {
    metadata.code = code;
  }
  if (name) {
    metadata.name = name;
  }
  if (message) {
    metadata.message = message;
  }

  const cause =
    candidate.cause !== null &&
    typeof candidate.cause === "object"
      ? candidate.cause as Record<
          string,
          unknown
        >
      : undefined;
  if (cause) {
    const causeCode = safeDiagnosticValue(
      cause.code,
    );
    const causeName = safeDiagnosticValue(
      cause.name,
    );
    const causeMessage =
      sanitizeDiagnosticMessage(
        cause.message,
        sensitiveValues,
      );
    if (causeCode) {
      metadata.causeCode = causeCode;
    }
    if (causeName) {
      metadata.causeName = causeName;
    }
    if (causeMessage) {
      metadata.causeMessage =
        causeMessage;
    }
  }

  return metadata;
}

interface FirebaseTokenProjectDiagnostic {
  tokenAudience?: string;
  tokenIssuerProjectId?: string;
  audienceMismatch: boolean;
  issuerMismatch: boolean;
}

export function getFirebaseTokenProjectDiagnostic(
  idToken: string,
  projectId: string,
): FirebaseTokenProjectDiagnostic {
  try {
    const segments = idToken.split(".");
    if (segments.length !== 3) {
      throw new Error("Malformed JWT");
    }
    const payload: unknown = JSON.parse(
      Buffer.from(
        segments[1],
        "base64url",
      ).toString("utf8"),
    );
    if (
      payload === null ||
      typeof payload !== "object"
    ) {
      throw new Error("Malformed JWT payload");
    }

    const claims = payload as Record<
      string,
      unknown
    >;
    const audience =
      typeof claims.aud === "string"
        ? claims.aud
        : undefined;
    const issuer =
      typeof claims.iss === "string"
        ? claims.iss
        : undefined;
    const issuerPrefix =
      "https://securetoken.google.com/";
    const issuerProjectId =
      issuer?.startsWith(issuerPrefix)
        ? issuer.slice(
            issuerPrefix.length,
          )
        : undefined;

    return {
      tokenAudience:
        safeDiagnosticValue(audience),
      tokenIssuerProjectId:
        safeDiagnosticValue(
          issuerProjectId,
        ),
      audienceMismatch:
        audience !== undefined &&
        audience !== projectId,
      issuerMismatch:
        issuer !== undefined &&
        issuer !==
          `${issuerPrefix}${projectId}`,
    };
  } catch {
    return {
      audienceMismatch: false,
      issuerMismatch: false,
    };
  }
}

async function verifyFirebaseIdToken(
  idToken: string,
): Promise<VerifiedFirebaseToken> {
  const { firebaseAuth } = await import(
    "@/infrastructure/db/firebase-admin-auth"
  );
  return firebaseAuth.verifyIdToken(
    idToken,
  );
}

async function getDefaultProjectConsistency():
  Promise<ProjectConsistency> {
  const {
    getFirebaseAdminProjectConsistency,
  } = await import(
    "@/infrastructure/db/firebase-admin"
  );
  return getFirebaseAdminProjectConsistency();
}

export function createFirebaseStaffSessionHandler(
  input:
    | VerifyIdToken
    | FirebaseStaffSessionHandlerOptions = {},
) {
  const options:
    FirebaseStaffSessionHandlerOptions =
    typeof input === "function"
      ? {
          verifyIdToken: input,
          getProjectConsistency:
            async () => ({
              configuredProjectId:
                process.env
                  .FIREBASE_PROJECT_ID ??
                "unconfigured",
              consistent: true,
            }),
        }
      : input;
  const verifyIdToken =
    options.verifyIdToken ??
    verifyFirebaseIdToken;
  const getProjectConsistency =
    options.getProjectConsistency ??
    getDefaultProjectConsistency;
  const logError =
    options.logError ??
    ((message, metadata) =>
      console.error(message, metadata));

  return async function POST(
    request: Request,
  ): Promise<Response> {
    const body = bodySchema.safeParse(
      await request.json().catch(
        () => undefined,
      ),
    );
    if (!body.success) {
      return Response.json(
        {
          ok: false,
          error:
            "A valid Firebase ID token is required.",
        },
        { status: 400 },
      );
    }

    let consistency: ProjectConsistency;
    try {
      consistency =
        await getProjectConsistency();
    } catch (error) {
      const projectId =
        process.env.FIREBASE_PROJECT_ID ??
        "unconfigured";
      logError(
        "Firebase Admin initialization failed",
        getSafeFirebaseAdminErrorMetadata(
          error,
          projectId,
          getSensitiveDiagnosticValues(
            body.data.idToken,
          ),
        ),
      );
      return Response.json(
        {
          ok: false,
          error:
            "Firebase authentication failed.",
        },
        { status: 401 },
      );
    }
    if (!consistency.consistent) {
      const metadata: Record<
        string,
        string
      > = {
        code:
          "auth/project-id-mismatch",
        projectId:
          consistency.configuredProjectId,
      };
      if (consistency.appProjectId) {
        metadata.appProjectId =
          consistency.appProjectId;
      }
      if (
        consistency.credentialProjectId
      ) {
        metadata.credentialProjectId =
          consistency.credentialProjectId;
      }
      logError(
        "Firebase Admin project configuration mismatch",
        metadata,
      );
      return Response.json(
        {
          ok: false,
          error:
            "Firebase authentication failed.",
        },
        { status: 401 },
      );
    }

    const tokenProject =
      getFirebaseTokenProjectDiagnostic(
        body.data.idToken,
        consistency.configuredProjectId,
      );
    if (
      tokenProject.audienceMismatch ||
      tokenProject.issuerMismatch
    ) {
      const metadata: Record<
        string,
        string
      > = {
        code:
          "auth/token-project-mismatch",
        projectId:
          consistency.configuredProjectId,
      };
      if (tokenProject.tokenAudience) {
        metadata.tokenAudience =
          tokenProject.tokenAudience;
      }
      if (
        tokenProject.tokenIssuerProjectId
      ) {
        metadata.tokenIssuerProjectId =
          tokenProject.tokenIssuerProjectId;
      }
      logError(
        "Firebase ID token project mismatch",
        metadata,
      );
      return Response.json(
        {
          ok: false,
          error:
            "Firebase authentication failed.",
        },
        { status: 401 },
      );
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyIdToken(
        body.data.idToken,
      );
    } catch (error) {
      logError(
        "Firebase staff token verification failed",
        getSafeFirebaseAdminErrorMetadata(
          error,
          consistency.configuredProjectId,
          getSensitiveDiagnosticValues(
            body.data.idToken,
          ),
        ),
      );
      return Response.json(
        {
          ok: false,
          error:
            "Firebase authentication failed.",
        },
        { status: 401 },
      );
    }

    const email = normalizeStaffEmail(
      decoded.email,
    );
    if (
      !email ||
      !isAllowedStaffEmail(email)
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "This account is not authorized for the Staff Inbox.",
        },
        { status: 403 },
      );
    }

    let sessionToken: string;
    try {
      sessionToken =
        createFirebaseStaffSessionToken({
          email,
          name:
            typeof decoded.name ===
            "string"
              ? decoded.name
              : null,
        });
    } catch {
      return Response.json(
        {
          ok: false,
          error:
            "Staff authentication is not configured.",
        },
        { status: 503 },
      );
    }

    const response = Response.json({
      ok: true,
      authenticated: true,
      authMethod: "firebase",
      user: {
        email,
        name:
          typeof decoded.name ===
          "string"
            ? decoded.name.trim() || null
            : null,
      },
    });
    response.headers.append(
      "Set-Cookie",
      buildFirebaseStaffSessionCookie(
        sessionToken,
      ),
    );

    return response;
  };
}

export const POST =
  createFirebaseStaffSessionHandler();
