import {
  mockKnowledgeRepository,
} from "@/core/ai-platform/providers/mock/mock-knowledge-environment";

import {
  jsonError,
  requireExperimentApiKey,
} from "../../route-utils";

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

  if (unauthorized) {
    return unauthorized;
  }

  const {
    id,
  } = await context.params;

  try {
    const document =
      await mockKnowledgeRepository
        .getDocument(id);

    if (!document) {
      return jsonError(
        new Error(
          "Knowledge document not found",
        ),
        404,
      );
    }

    return Response.json({
      ok: true,
      document,
    });
  } catch (error) {
    return jsonError(error);
  }
}
