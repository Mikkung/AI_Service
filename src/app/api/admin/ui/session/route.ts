import {
  z,
} from "zod";

import {
  buildAdminUiSessionCookie,
  buildExpiredAdminUiSessionCookie,
  createAdminUiSessionToken,
} from "@/lib/http/admin-ui-session";

import {
  isLegacyAdminUiLoginEnabled,
} from "@/lib/auth/staff-auth-config";

import {
  resolveStaffInboxAuthorization,
} from "@/lib/auth/staff-inbox-authorization";

import {
  buildExpiredFirebaseStaffSessionCookie,
} from "@/lib/auth/staff-inbox-session";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic =
  "force-dynamic";

const requestSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(1_000),
});

export async function GET(
  request: Request,
) {
  const legacyLoginEnabled =
    isLegacyAdminUiLoginEnabled();
  const authorization =
    await resolveStaffInboxAuthorization(
      request,
      {
        legacyLoginEnabled,
      },
    );

  return Response.json({
    ok: true,
    authenticated:
      authorization !== null,
    authMethod:
      authorization?.authMethod ?? null,
    user: authorization?.user ?? null,
    legacyLoginEnabled,
  });
}

export async function POST(
  request: Request,
) {
  if (
    !isLegacyAdminUiLoginEnabled()
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "Legacy admin-key login is disabled.",
      },
      { status: 403 },
    );
  }

  let json: unknown;

  try {
    json =
      await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const parsed =
    requestSchema.safeParse(
      json,
    );

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error:
          "Invalid admin access key.",
      },
      { status: 400 },
    );
  }

  const apiKeyRequest =
    new Request(
      request.url,
      {
        headers: {
          "x-api-key":
            parsed.data.apiKey,
        },
      },
    );

  if (
    !hasValidApiKey(
      apiKeyRequest,
    )
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "Invalid admin access key.",
      },
      { status: 401 },
    );
  }

  const response =
    Response.json({
      ok: true,
      authenticated: true,
      authMethod: "legacy",
      user: null,
      legacyLoginEnabled: true,
    });

  response.headers.append(
    "Set-Cookie",
    buildAdminUiSessionCookie(
      createAdminUiSessionToken(),
    ),
  );

  return response;
}

export async function DELETE() {
  const response =
    Response.json({
      ok: true,
      authenticated: false,
      authMethod: null,
      user: null,
      legacyLoginEnabled:
        isLegacyAdminUiLoginEnabled(),
    });

  response.headers.append(
    "Set-Cookie",
    buildExpiredAdminUiSessionCookie(),
  );
  response.headers.append(
    "Set-Cookie",
    buildExpiredFirebaseStaffSessionCookie(),
  );

  return response;
}
