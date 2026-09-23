import {
  createProductionStaffInboxEnvironment,
} from "@/core/ai-platform/inbox/production-staff-inbox-environment";

import type {
  StaffInboxService,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  inboxRouteError,
  requireInboxSession,
} from "../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceFactory = () => Pick<
  StaffInboxService,
  "listConversations"
>;

export function createInboxConversationListHandler(
  serviceFactory: ServiceFactory = () =>
    createProductionStaffInboxEnvironment()
      .service,
) {
  return async function GET(
    request: Request,
  ): Promise<Response> {
    const unauthorized =
      requireInboxSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    const url = new URL(request.url);
    const rawLimit =
      url.searchParams.get("limit");
    const limit = rawLimit
      ? Number(rawLimit)
      : 50;

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "limit must be an integer from 1 to 50",
        },
        {
          status: 400,
        },
      );
    }

    try {
      const conversations =
        await serviceFactory()
          .listConversations(
            limit,
            url.searchParams.get(
              "beforeUpdatedAt",
            ) ?? undefined,
          );
      return Response.json({
        ok: true,
        conversations,
      });
    } catch (error) {
      return inboxRouteError(error);
    }
  };
}

export const GET =
  createInboxConversationListHandler();
