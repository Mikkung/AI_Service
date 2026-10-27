import {
  AssistedStaffSendConflictError,
  AssistedStaffSendInvariantError,
} from "@/core/ai-platform/repositories/assisted-staff-send-repository";

import {
  AssistedSendReconciliationRequiredError,
  FacebookMessagingWindowExpiredError,
  FacebookSendDeliveryError,
  LinePushDeliveryError,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  ConversationConflictError,
  ConversationInvariantError,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

import {
  resolveStaffInboxAuthorization,
  type StaffInboxAuthorization,
  type StaffInboxAuthorizationOptions,
} from "@/lib/auth/staff-inbox-authorization";

export type InboxAuthorizationResult =
  | {
      authorized: true;
      auth: StaffInboxAuthorization;
    }
  | {
      authorized: false;
      response: Response;
    };

export async function requireInboxSession(
  request: Request,
  options?: StaffInboxAuthorizationOptions,
): Promise<InboxAuthorizationResult> {
  const authorization =
    await resolveStaffInboxAuthorization(
      request,
      options,
    );

  if (authorization) {
    return {
      authorized: true,
      auth: authorization,
    };
  }

  return {
    authorized: false,
    response: Response.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    ),
  };
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

  if (error instanceof FacebookMessagingWindowExpiredError) {
    return Response.json({ ok: false, error: error.message }, { status: 409 });
  }

  if (
    error instanceof LinePushDeliveryError ||
    error instanceof FacebookSendDeliveryError
  ) {
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
