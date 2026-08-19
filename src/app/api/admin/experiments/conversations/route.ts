import { z } from "zod";

import {
  createMockConversationService,
  mockConversationRepository,
} from "@/core/ai-platform/providers/mock/mock-conversation-environment";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  channel: z.enum([
    "web",
    "line",
    "facebook",
    "teams",
  ]),
  channelUserId: z
    .string()
    .trim()
    .min(1)
    .max(200),
  metadata: z
    .record(
      z.string(),
      z.unknown(),
    )
    .optional(),
});

export async function POST(
  request: Request,
) {
  if (!hasValidApiKey(request)) {
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

  const parsed =
    createSchema.safeParse(
      await request.json(),
    );

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Invalid request",
        issues:
          parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const service =
    createMockConversationService();

  const conversation =
    await service.createConversation(
      parsed.data,
    );

  return Response.json({
    ok: true,
    conversation,
  });
}

export async function GET(
  request: Request,
) {
  if (!hasValidApiKey(request)) {
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

  const conversations =
    await mockConversationRepository
      .listConversations();

  return Response.json({
    ok: true,
    conversations,
  });
}
