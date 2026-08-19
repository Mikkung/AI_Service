import { z } from "zod";

import {
  AnswerService,
} from "@/core/ai-platform/answering/answer-service";

import {
  getGroundedQAProvider,
} from "@/core/ai-platform/registry/grounded-qa-provider-registry";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(2000),
  scenario: z
    .enum([
      "grounded",
      "unsupported",
      "missing_citation",
    ])
    .default("grounded"),
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

  try {
    const body =
      await request.json();

    const parsed =
      requestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          error:
            "Invalid request",
          issues:
            parsed.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }

    const provider =
      getGroundedQAProvider(
        "mock",
        {
          scenario:
            parsed.data.scenario,
        },
      );

    const service =
      new AnswerService(provider);

    const result =
      await service.answer({
        question:
          parsed.data.question,
        audience: "public",
      });

    return Response.json({
      ok: true,
      question:
        parsed.data.question,
      scenario:
        parsed.data.scenario,
      ...result,
    });
  } catch (error) {
    console.error(
      "AI platform mock chat failed",
      error instanceof Error
        ? error.message
        : "Unknown AI platform mock chat error",
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown AI platform mock chat error",
      },
      {
        status: 500,
      },
    );
  }
}
