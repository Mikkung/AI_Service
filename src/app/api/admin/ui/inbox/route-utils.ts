import {
  AssistedStaffSendConflictError,
  AssistedStaffSendInvariantError,
} from "@/core/ai-platform/repositories/assisted-staff-send-repository";

import {
  AssistedSendReconciliationRequiredError,
  LinePushDeliveryError,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  ConversationConflictError,
  ConversationInvariantError,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

import {
  hasValidAdminUiSession,
} from "@/lib/http/admin-ui-session";

export function requireInboxSession(
  request: Request,
): Response | null {
  return hasValidAdminUiSession(request)
    ? null
    : Response.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
}

export function inboxRouteError(
  error: unknown,
): Response {
  if (
    error instanceof
    AssistedSendReconciliationRequiredError
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

  if (error instanceof LinePushDeliveryError) {
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      {
        status: 502,
      },
    );
  }

  if (
    error instanceof
      AssistedStaffSendConflictError ||
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
      AssistedStaffSendInvariantError ||
    error instanceof
      ConversationInvariantError ||
    (error instanceof Error &&
      /not found/i.test(error.message))
  ) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Invalid inbox state",
      },
      {
        status:
          error instanceof Error &&
          /not found/i.test(error.message)
            ? 404
            : 400,
      },
    );
  }

  return Response.json(
    {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unexpected Staff Inbox error",
    },
    {
      status: 400,
    },
  );
}
