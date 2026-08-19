import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export function requireExperimentApiKey(
  request: Request,
): Response | null {
  if (hasValidApiKey(request)) {
    return null;
  }

  return Response.json(
    {
      ok: false,
      error: "Unauthorized",
    },
    {
      status: 401,
    },
  );
}

export function jsonError(
  error: unknown,
  status = 400,
): Response {
  return Response.json(
    {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown knowledge governance error",
    },
    {
      status,
    },
  );
}
