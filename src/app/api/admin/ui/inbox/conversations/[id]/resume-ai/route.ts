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
  "resumeAI"
>;

export function createInboxResumeAIHandler(
  serviceFactory: ServiceFactory = () =>
    createProductionStaffInboxEnvironment()
      .service,
) {
  return async function POST(
    request: Request,
    context: Context,
  ): Promise<Response> {
    const unauthorized =
      requireInboxSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    try {
      const { id } = await context.params;
      const result =
        await serviceFactory().resumeAI(id);

      return Response.json({
        ok: true,
        conversation:
          result.conversation,
        handoff: result.handoff,
        resumed: result.resumed,
      });
    } catch (error) {
      return inboxRouteError(error);
    }
  };
}

export const POST =
  createInboxResumeAIHandler();
