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
  email_verified?: boolean;
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

export function getSafeFirebaseAdminErrorMetadata(
  error: unknown,
  projectId: string,
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

  if (code) {
    metadata.code = code;
  }
  if (name) {
    metadata.name = name;
  }

  return metadata;
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

    const consistency =
      await getProjectConsistency();
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
      decoded.email_verified !== true ||
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
