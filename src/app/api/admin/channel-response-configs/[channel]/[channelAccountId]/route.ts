import { z } from "zod";

import {
  createProductionChannelResponseConfigEnvironment,
} from "@/core/ai-platform/channels/production-channel-response-config-environment";

import type {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  channel: z.enum([
    "line",
    "facebook",
  ]),
  channelAccountId: z
    .string()
    .trim()
    .min(1)
    .max(200),
});

const updateSchema = z.object({
  responseMode: z.enum([
    "off",
    "draft",
    "auto",
  ]),
});

interface RouteContext {
  params: Promise<{
    channel: string;
    channelAccountId: string;
  }>;
}

type ConfigService = Pick<
  ChannelResponseConfigService,
  | "resolveResponseMode"
  | "updateResponseMode"
>;

type ConfigServiceFactory =
  () => ConfigService;

function unauthorizedResponse(): Response {
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

function invalidRequestResponse(
  issues: unknown,
): Response {
  return Response.json(
    {
      ok: false,
      error: "Invalid request",
      issues,
    },
    {
      status: 400,
    },
  );
}

export function createChannelResponseConfigRouteHandlers(
  serviceFactory: ConfigServiceFactory =
    () =>
      createProductionChannelResponseConfigEnvironment()
        .service,
) {
  async function parseParams(
    context: RouteContext,
  ) {
    return paramsSchema.safeParse(
      await context.params,
    );
  }

  async function GET(
    request: Request,
    context: RouteContext,
  ): Promise<Response> {
    if (!hasValidApiKey(request)) {
      return unauthorizedResponse();
    }

    const parsedParams =
      await parseParams(context);

    if (!parsedParams.success) {
      return invalidRequestResponse(
        parsedParams.error.flatten(),
      );
    }

    try {
      const result =
        await serviceFactory()
          .resolveResponseMode(
            parsedParams.data.channel,
            parsedParams.data
              .channelAccountId,
          );

      return Response.json({
        ok: true,
        ...result,
      });
    } catch {
      return Response.json(
        {
          ok: false,
          error:
            "Unexpected channel response config error",
        },
        {
          status: 500,
        },
      );
    }
  }

  async function PUT(
    request: Request,
    context: RouteContext,
  ): Promise<Response> {
    if (!hasValidApiKey(request)) {
      return unauthorizedResponse();
    }

    const parsedParams =
      await parseParams(context);
    const parsedBody =
      updateSchema.safeParse(
        await request
          .json()
          .catch(() => undefined),
      );

    if (
      !parsedParams.success ||
      !parsedBody.success
    ) {
      return invalidRequestResponse({
        params: parsedParams.success
          ? undefined
          : parsedParams.error.flatten(),
        body: parsedBody.success
          ? undefined
          : parsedBody.error.flatten(),
      });
    }

    try {
      const config =
        await serviceFactory()
          .updateResponseMode({
            channel:
              parsedParams.data.channel,
            channelAccountId:
              parsedParams.data
                .channelAccountId,
            responseMode:
              parsedBody.data
                .responseMode,
          });

      return Response.json({
        ok: true,
        config,
      });
    } catch {
      return Response.json(
        {
          ok: false,
          error:
            "Unexpected channel response config error",
        },
        {
          status: 500,
        },
      );
    }
  }

  return {
    GET,
    PUT,
  };
}

const handlers =
  createChannelResponseConfigRouteHandlers();

export const GET = handlers.GET;
export const PUT = handlers.PUT;
