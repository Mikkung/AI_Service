import {
  createProductionLineEnvironment,
} from "@/core/ai-platform/integrations/line/production-line-environment";

import {
  processLineWebhook,
  verifyLineWebhookSignature,
} from "@/core/ai-platform/integrations/line/line-webhook-adapter";

import type {
  LineMessageService,
} from "@/core/ai-platform/integrations/line/line-message-service";

import {
  env,
} from "@/core/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LineWebhookRouteDependencies {
  channelSecret: string;
  createLineMessageService(): Pick<
    LineMessageService,
    "processTextEvent"
  >;
}

export function createLineWebhookHandler(
  dependencies: LineWebhookRouteDependencies,
) {
  return async function POST(
    request: Request,
  ): Promise<Response> {
    const rawBody = new Uint8Array(
      await request.arrayBuffer(),
    );
    const signature =
      request.headers.get(
        "x-line-signature",
      );

    if (
      !verifyLineWebhookSignature(
        rawBody,
        signature,
        dependencies.channelSecret,
      )
    ) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    try {
      const summary =
        await processLineWebhook(
          rawBody,
          dependencies
            .createLineMessageService(),
        );

      return Response.json({
        ok: true,
        ...summary,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /Malformed LINE/.test(
          error.message,
        )
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Invalid LINE webhook",
          },
          {
            status: 400,
          },
        );
      }

      console.error(
        "LINE webhook processing failed",
      );

      return Response.json(
        {
          ok: false,
          error:
            "LINE webhook processing failed",
        },
        {
          status: 500,
        },
      );
    }
  };
}

export const POST =
  createLineWebhookHandler({
    channelSecret:
      env.LINE_CHANNEL_SECRET,
    createLineMessageService: () =>
      createProductionLineEnvironment()
        .lineMessageService,
  });
