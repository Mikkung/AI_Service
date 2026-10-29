import {
  createProductionStaffInboxEnvironment,
} from "@/core/ai-platform/inbox/production-staff-inbox-environment";

import type {
  StaffInboxService,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  inboxRouteError,
  requireInboxSession,
} from "../../../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

type ServiceFactory = () => Pick<
  StaffInboxService,
  "markRead"
>;

export function createInboxReadHandler(
  serviceFactory: ServiceFactory = () =>
    createProductionStaffInboxEnvironment()
      .service,
  authorize = requireInboxSession,
) {
  return async function POST(
    request: Request,
    context: Context,
  ): Promise<Response> {
    const authorization =
      await authorize(request);
    if (!authorization.authorized) {
      return authorization.response;
    }

    try {
      const { id } = await context.params;
      const result =
        await serviceFactory()
          .markRead(id);
      return Response.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      return inboxRouteError(error);
    }
  };
}

export const POST =
  createInboxReadHandler();
