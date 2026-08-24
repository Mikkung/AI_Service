import { z } from "zod";

import {
  AnswerService,
} from "@/core/ai-platform/answering/answer-service";

import {
  OpenAIGroundedQAProvider,
} from "@/core/ai-platform/providers/openai/openai-grounded-qa-provider";

import {
  FirestoreOpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/firestore-openai-vector-store-config-repository";

import {
  jsonError,
  requireExperimentApiKey,
} from "../../knowledge/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(2000),
  conversationContext: z
    .array(
      z.object({
        role: z.enum([
          "user",
          "assistant",
        ]),
        text: z
          .string()
          .trim()
          .min(1)
          .max(4000),
      }),
    )
    .max(10)
    .optional(),
});

function safeProviderError(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value
    .replace(
      /sk-[A-Za-z0-9_-]+/g,
      "sk-REDACTED",
    )
    .replace(
      /Bearer\s+[A-Za-z0-9._-]+/gi,
      "Bearer REDACTED",
    )
    .slice(0, 500);
}

export async function POST(
  request: Request,
) {
  const unauthorized =
    requireExperimentApiKey(request);

  if (unauthorized) {
    return unauthorized;
  }

  const parsed =
    schema.safeParse(
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

  try {
    const provider =
      new OpenAIGroundedQAProvider({
        vectorStoreConfigRepository:
          new FirestoreOpenAIVectorStoreConfigRepository(),
      });
    const service =
      new AnswerService(provider);
    const result =
      await service.answer({
        question:
          parsed.data.question,
        audience: "public",
        conversationContext:
          parsed.data
            .conversationContext,
      });

    const providerError =
      result.groundingReason ===
      "provider_error"
        ? safeProviderError(
            result.providerMetadata
              ?.providerError,
          )
        : undefined;

    return Response.json({
      ok: true,
      question:
        parsed.data.question,
      provider:
        result.provider,
      model:
        result.model,
      reasoningEffort:
        provider.reasoningEffort,
      answerable:
        result.answerable,
      safeToSend:
        result.safeToSend,
      groundingReason:
        result.groundingReason,
      answer:
        result.answer,
      citations:
        result.citations,
      retrieval:
        result.providerMetadata
          ?.retrieval,
      providerError,
      latencyMs:
        result.latencyMs,
      usage:
        result.usage,
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
