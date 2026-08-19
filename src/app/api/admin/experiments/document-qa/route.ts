import { z } from "zod";

import {
  verifyDocumentQAEvidence,
} from "@/core/experiments/document-qa/evidence-verifier";

import {
  loadFullSourceDocument,
} from "@/core/experiments/document-qa/full-source-loader";

import {
  getDocumentQAProvider,
  UnsupportedDocumentQAProviderError,
} from "@/core/experiments/document-qa/provider-registry";

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
  sourceId: z
    .string()
    .trim()
    .min(1)
    .max(200),
  provider: z
    .string()
    .trim()
    .min(1)
    .max(80)
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

  const startedAt =
    Date.now();

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

    const {
      question,
      sourceId,
      provider: providerName,
    } = parsed.data;

    const loadedSource =
      await loadFullSourceDocument({
        sourceId,
      });

    const provider =
      getDocumentQAProvider(
        providerName,
      );

    const output =
      await provider.answer({
        question,
        sourceText:
          loadedSource.sourceText,
      });

    const evidenceVerified =
      verifyDocumentQAEvidence(
        output,
        loadedSource.sourceText,
      );

    return Response.json({
      ok: true,
      question,
      sourceId,
      provider:
        output.provider,
      model:
        output.model,
      answerable:
        output.answerable,
      answer:
        output.answer,
      evidence:
        output.evidence,
      evidenceVerified,
      sourceChunkCount:
        loadedSource.sourceChunkCount,
      sourceCharacterCount:
        loadedSource.sourceCharacterCount,
      latencyMs:
        Date.now() - startedAt,
      finishReason:
        output.finishReason,
      usage:
        output.usage,
    });
  } catch (error) {
    if (
      error instanceof
      UnsupportedDocumentQAProviderError
    ) {
      return Response.json(
        {
          ok: false,
          error:
            error.message,
        },
        {
          status: 400,
        },
      );
    }

    console.error(
      "Document QA experiment failed",
      error instanceof Error
        ? error.message
        : "Unknown document QA error",
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown document QA error",
      },
      {
        status: 500,
      },
    );
  }
}
