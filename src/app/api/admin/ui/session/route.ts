import {
  z,
} from "zod";

import {
  buildAdminUiSessionCookie,
  buildExpiredAdminUiSessionCookie,
  createAdminUiSessionToken,
  hasValidAdminUiSession,
} from "@/lib/http/admin-ui-session";

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
  return Response.json({
    ok: true,
    authenticated:
      hasValidAdminUiSession(
        request,
      ),
  });
}

export async function POST(
  request: Request,
) {
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
    });

  response.headers.append(
    "Set-Cookie",
    buildExpiredAdminUiSessionCookie(),
  );

  return response;
}
