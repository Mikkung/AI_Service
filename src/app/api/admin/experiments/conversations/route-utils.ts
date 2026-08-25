import {
  ConversationConflictError,
  ConversationInvariantError,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export function requireConversationExperimentApiKey(
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

export function conversationRouteError(
  error: unknown,
): Response {
  if (
    error instanceof
    ConversationConflictError
  ) {
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      {
        status: 409,
      },
    );
  }

  if (
    error instanceof
    ConversationInvariantError
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "Conversation state is inconsistent. Please retry or contact an administrator.",
      },
      {
        status: 500,
      },
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : "Unknown conversation error";

  if (/not found/i.test(message)) {
    return Response.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 404,
      },
    );
  }

  return Response.json(
    {
      ok: false,
      error:
        "Unexpected conversation error",
    },
    {
      status: 500,
    },
  );
}
