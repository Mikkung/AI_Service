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
  responseMode: z.enum([
    "off",
    "draft",
    "auto",
  ]),
}).strict();

interface Context {
  params: Promise<{
    channel: string;
    channelAccountId: string;
  }>;
}

type ServiceFactory = () => Pick<
  StaffInboxService,
  "updateResponseMode"
>;

export function createInboxModeHandler(
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

    const params = await context.params;
    const body = bodySchema.safeParse(
      await request.json().catch(
        () => undefined,
      ),
    );
    if (
      params.channel !== "line" ||
      !params.channelAccountId ||
      !body.success
    ) {
      return Response.json(
        {
          ok: false,
          error: "Invalid response mode update",
        },
        {
          status: 400,
        },
      );
    }

    try {
      const config =
        await serviceFactory()
          .updateResponseMode({
            channelAccountId:
              params.channelAccountId,
            responseMode:
              body.data.responseMode,
          });
      return Response.json({
        ok: true,
        config,
      });
    } catch (error) {
      return inboxRouteError(error);
    }
  };
}

export const PUT =
  createInboxModeHandler();
