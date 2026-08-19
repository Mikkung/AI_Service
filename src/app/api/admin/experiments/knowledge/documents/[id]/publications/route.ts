import {
  mockKnowledgePublicationRepository,
} from "@/core/ai-platform/providers/mock/mock-knowledge-environment";

import {
  requireExperimentApiKey,
} from "../../../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const unauthorized =
    requireExperimentApiKey(request);
  if (unauthorized) return unauthorized;

  const {
    id,
  } = await context.params;

  const publications =
    await mockKnowledgePublicationRepository
      .listPublications({
        documentId: id,
      });

  return Response.json({
    ok: true,
    publications,
  });
}
