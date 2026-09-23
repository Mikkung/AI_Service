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
  text: z.string().trim().min(1).max(5000),
  clientRequestId: z.string().uuid(),
  sourceMessageId:
    z.string().trim().min(1).max(300).optional(),
  resumeAI: z.boolean().optional().default(false),
}).strict();

interface Context {
  params: Promise<{ id: string }>;
}

type ServiceFactory = () => Pick<
  StaffInboxService,
  | "sendAssistedReply"
  | "sendAssistedReplyAndResumeAI"
>;

export function createInboxSendHandler(
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

    const body = bodySchema.safeParse(
      await request.json().catch(
        () => undefined,
      ),
    );
    if (!body.success) {
      return Response.json(
        {
          ok: false,
          error: "Invalid assisted reply",
        },
        {
          status: 400,
        },
      );
    }

    try {
      const { id } = await context.params;
      const service = serviceFactory();
      const { resumeAI, ...sendInput } =
        body.data;
      const result = resumeAI
        ? await service
            .sendAssistedReplyAndResumeAI({
              conversationId: id,
              ...sendInput,
            })
        : await service
            .sendAssistedReply({
              conversationId: id,
              ...sendInput,
            });
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
  createInboxSendHandler();
