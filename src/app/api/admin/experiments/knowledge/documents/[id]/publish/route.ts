import { z } from "zod";

import {
  createMockKnowledgeGovernanceService,
} from "@/core/ai-platform/providers/mock/mock-knowledge-environment";

import {
  jsonError,
  requireExperimentApiKey,
} from "../../../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  targetProvider: z
    .string()
    .trim()
    .min(1)
    .default("mock"),
  targetEnvironment: z
    .enum([
      "development",
      "production",
    ])
    .default("development"),
  now: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

export async function POST(
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

  const {
    id,
  } = await context.params;

  try {
    const result =
      await createMockKnowledgeGovernanceService()
        .publish({
          documentId: id,
          ...parsed.data,
        });

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return jsonError(error);
  }
}
