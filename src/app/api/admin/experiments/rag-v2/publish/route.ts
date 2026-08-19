import { z } from "zod";

import {
  KnowledgeGovernanceService,
} from "@/core/ai-platform/knowledge/knowledge-governance-service";

import {
  mockKnowledgePublicationRepository,
  mockKnowledgeRepository,
} from "@/core/ai-platform/providers/mock/mock-knowledge-environment";

import {
  OpenAIKnowledgePublisher,
} from "@/core/ai-platform/providers/openai/openai-knowledge-publisher";

import {
  jsonError,
  requireExperimentApiKey,
} from "../../knowledge/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(300),
  sourceReference: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional(),
  category: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .default("admission"),
  owner: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .optional(),
  version: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional(),
  effectiveFrom: z
    .string()
    .trim()
    .min(1)
    .optional(),
  effectiveTo: z
    .string()
    .trim()
    .min(1)
    .optional(),
  contentType: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .default("text/plain"),
  filename: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional(),
  actorId: z
    .string()
    .trim()
    .min(1)
    .max(150),
  approve: z
    .boolean()
    .default(false),
  content: z
    .string()
    .min(1),
});

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
    const publisher =
      new OpenAIKnowledgePublisher({
        publicationRepository:
          mockKnowledgePublicationRepository,
        targetAudience: "public",
      });

    const service =
      new KnowledgeGovernanceService({
        knowledgeRepository:
          mockKnowledgeRepository,
        publisher,
      });

    const document =
      await service.createDraft({
        title:
          parsed.data.title,
        sourceSystem: "manual",
        sourceReference:
          parsed.data
            .sourceReference,
        audience: "public",
        category:
          parsed.data.category,
        owner:
          parsed.data.owner,
        version:
          parsed.data.version,
        effectiveFrom:
          parsed.data
            .effectiveFrom,
        effectiveTo:
          parsed.data.effectiveTo,
        contentType:
          parsed.data.contentType,
        filename:
          parsed.data.filename,
        actorId:
          parsed.data.actorId,
        content:
          parsed.data.content,
        metadata: {
          phase: "D",
          provider:
            "openai",
        },
      });

    if (!parsed.data.approve) {
      return Response.json({
        ok: true,
        approved: false,
        published: false,
        document,
        message:
          "Draft created. Re-run with approve=true to explicitly approve and publish.",
      });
    }

    await service.submitForReview({
      documentId:
        document.id,
      actorId:
        parsed.data.actorId,
      note:
        "Submitted by RAG v2 publication script",
    });

    const approvedDocument =
      await service.approve({
        documentId:
          document.id,
        actorId:
          parsed.data.actorId,
      });

    const publication =
      await service.publish({
        documentId:
          approvedDocument.id,
        targetProvider:
          "openai",
        targetEnvironment:
          "development",
      });

    return Response.json({
      ok: true,
      approved: true,
      document:
        approvedDocument,
      publication,
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
