import { z } from "zod";

import {
  createMockKnowledgeGovernanceService,
  mockKnowledgeRepository,
} from "@/core/ai-platform/providers/mock/mock-knowledge-environment";

import {
  jsonError,
  requireExperimentApiKey,
} from "../route-utils";

import type {
  KnowledgeAudience,
  KnowledgeStatus,
} from "@/core/ai-platform/types/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(300),
  sourceSystem: z
    .enum([
      "sharepoint",
      "manual",
      "approved_qa",
      "other",
    ])
    .default("manual"),
  sourceReference: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional(),
  audience: z.enum([
    "public",
    "internal",
  ]),
  category: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .optional(),
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
    .optional(),
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
  metadata: z
    .record(
      z.string(),
      z.unknown(),
    )
    .optional(),
  content: z
    .string()
    .min(1),
});

function parseAudience(
  value: string | null,
): KnowledgeAudience | undefined {
  return value === "public" ||
    value === "internal"
    ? value
    : undefined;
}

function parseStatus(
  value: string | null,
): KnowledgeStatus | undefined {
  return value === "draft" ||
    value === "review" ||
    value === "approved" ||
    value === "superseded" ||
    value === "archived"
    ? value
    : undefined;
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
    createDraftSchema.safeParse(
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
    const service =
      createMockKnowledgeGovernanceService();

    const document =
      await service.createDraft(
        parsed.data,
      );

    return Response.json({
      ok: true,
      document,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(
  request: Request,
) {
  const unauthorized =
    requireExperimentApiKey(request);

  if (unauthorized) {
    return unauthorized;
  }

  const url =
    new URL(request.url);

  const documents =
    await mockKnowledgeRepository
      .listDocuments({
        audience:
          parseAudience(
            url.searchParams.get(
              "audience",
            ),
          ),
        status:
          parseStatus(
            url.searchParams.get(
              "status",
            ),
          ),
        category:
          url.searchParams.get(
            "category",
          ) ?? undefined,
        owner:
          url.searchParams.get(
            "owner",
          ) ?? undefined,
      });

  return Response.json({
    ok: true,
    documents,
  });
}
