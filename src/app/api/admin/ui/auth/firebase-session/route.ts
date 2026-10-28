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

export function createFirebaseStaffSessionHandler(
  verifyIdToken: VerifyIdToken =
    verifyFirebaseIdToken,
) {
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

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyIdToken(
        body.data.idToken,
      );
    } catch {
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
