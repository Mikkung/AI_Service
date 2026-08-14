import { z } from "zod";

import {
  FirestoreKnowledgeRepository,
} from "@/infrastructure/repositories/firestore-knowledge-repository";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  sourceId: z
    .string()
    .trim()
    .min(1)
    .max(150),
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
      schema.safeParse(body);

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

    const repository =
      new FirestoreKnowledgeRepository();

    const chunksUpdated =
      await repository.deactivateSource(
        parsed.data.sourceId,
      );

    return Response.json({
      ok: true,
      sourceId:
        parsed.data.sourceId,
      status: "inactive",
      chunksUpdated,
    });
  } catch (error) {
    console.error(
      "Knowledge deactivate failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      },
    );
  }
}