import {
  createMockKnowledgeGovernanceService,
  mockKnowledgeRepository,
} from "@/core/ai-platform/providers/mock/mock-knowledge-environment";

import {
  requireExperimentApiKey,
} from "./route-utils";

import type {
  KnowledgeAudience,
  KnowledgeStatus,
} from "@/core/ai-platform/types/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const audience =
    parseAudience(
      url.searchParams.get("audience"),
    );

  const category =
    url.searchParams.get("category") ??
    undefined;

  if (
    url.searchParams.get("current") ===
    "true"
  ) {
    const service =
      createMockKnowledgeGovernanceService();

    const documents =
      await service.getCurrentApprovedKnowledge({
        audience:
          audience ?? "public",
        category,
      });

    return Response.json({
      ok: true,
      documents,
    });
  }

  const documents =
    await mockKnowledgeRepository
      .listDocuments({
        audience,
        status:
          parseStatus(
            url.searchParams.get(
              "status",
            ),
          ),
        category,
        owner:
          url.searchParams.get("owner") ??
          undefined,
      });

  return Response.json({
    ok: true,
    documents,
  });
}
