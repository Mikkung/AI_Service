import {
  LineMediaUnavailableError,
} from "@/core/ai-platform/integrations/line/line-media-client";

import {
  createProductionStaffInboxEnvironment,
} from "@/core/ai-platform/inbox/production-staff-inbox-environment";

import type {
  StaffInboxService,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  inboxRouteError,
  requireInboxSession,
} from "@/app/api/admin/ui/inbox/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{
    id: string;
    messageId: string;
  }>;
}

type ServiceFactory = () => Pick<
  StaffInboxService,
  "getImagePreview"
>;

export function createInboxMediaPreviewHandler(
  serviceFactory: ServiceFactory = () =>
    createProductionStaffInboxEnvironment()
      .service,
) {
  return async function GET(
    request: Request,
    context: Context,
  ): Promise<Response> {
    const unauthorized =
      requireInboxSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    try {
      const { id, messageId } =
        await context.params;
      const preview =
        await serviceFactory()
          .getImagePreview({
            conversationId: id,
            messageId,
          });

      return new Response(
        Buffer.from(preview.bytes),
        {
          status: 200,
          headers: {
            "content-type":
              preview.contentType,
            "cache-control":
              "private, no-store",
          },
        },
      );
    } catch (error) {
      if (
        error instanceof
        LineMediaUnavailableError
      ) {
        return Response.json(
          {
            ok: false,
            error: "Preview expired",
          },
          {
            status: error.status,
            headers: {
              "cache-control":
                "private, no-store",
            },
          },
        );
      }

      return inboxRouteError(error);
    }
  };
}

export const GET =
  createInboxMediaPreviewHandler();
