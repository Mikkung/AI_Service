import {
  createProductionConversationEnvironment,
} from "@/core/ai-platform/conversations/production-conversation-environment";

import {
  conversationRouteError,
  requireConversationExperimentApiKey,
} from "../route-utils";

export async function POST(
  request: Request,
): Promise<Response> {
  const unauthorized =
    requireConversationExperimentApiKey(
      request,
    );

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body =
      (await request.json().catch(
        () => ({}),
      )) as {
        limit?: unknown;
      };
    const requestedLimit =
      body.limit ?? 5;

    if (
      typeof requestedLimit !==
        "number" ||
      !Number.isInteger(
        requestedLimit,
      ) ||
      requestedLimit < 1 ||
      requestedLimit > 20
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "limit must be an integer between 1 and 20",
        },
        {
          status: 400,
        },
      );
    }

    const {
      service,
    } =
      createProductionConversationEnvironment();
    const summary =
      await service.recoverExpiredInboundProcessing(
        {
          limit: requestedLimit,
        },
      );

    return Response.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    return conversationRouteError(error);
  }
}
