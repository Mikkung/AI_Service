import {
  createProductionStaffInboxEnvironment,
} from "@/core/ai-platform/inbox/production-staff-inbox-environment";

import type {
  StaffInboxService,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  inboxRouteError,
  requireInboxSession,
} from "../../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

type ServiceFactory = () => Pick<
  StaffInboxService,
  "getConversationDetail"
>;

export function createInboxConversationDetailHandler(
  serviceFactory: ServiceFactory = () =>
    createProductionStaffInboxEnvironment()
      .service,
) {
  return async function GET(
    request: Request,
    context: Context,
  ): Promise<Response> {
    const authorization =
      await requireInboxSession(request);
    if (!authorization.authorized) {
      return authorization.response;
    }

    try {
      const { id } = await context.params;
      const detail =
        await serviceFactory()
          .getConversationDetail(id);
      return Response.json({
        ok: true,
        ...detail,
      });
    } catch (error) {
      return inboxRouteError(error);
    }
  };
}

export const GET =
  createInboxConversationDetailHandler();
