import {
  z,
} from "zod";

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

const bodySchema = z.object({
  sourceMessageId:
    z.string().trim().min(1).max(300),
  text: z.string().trim().min(1).max(5000),
}).strict();

interface Context {
  params: Promise<{ id: string }>;
}

type ServiceFactory = () => Pick<
  StaffInboxService,
  "editDraft"
>;

export function createInboxDraftHandler(
  serviceFactory: ServiceFactory = () =>
    createProductionStaffInboxEnvironment()
      .service,
) {
  return async function PUT(
    request: Request,
    context: Context,
  ): Promise<Response> {
    const unauthorized =
      requireInboxSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = bodySchema.safeParse(
      await request.json().catch(
        () => undefined,
      ),
    );
    if (!body.success) {
      return Response.json(
        {
          ok: false,
          error: "Invalid draft",
        },
        {
          status: 400,
        },
      );
    }

    try {
      const { id } = await context.params;
      const draft =
        await serviceFactory().editDraft({
          conversationId: id,
          ...body.data,
        });
      return Response.json({
        ok: true,
        draft,
      });
    } catch (error) {
      return inboxRouteError(error);
    }
  };
}

export const PUT =
  createInboxDraftHandler();
