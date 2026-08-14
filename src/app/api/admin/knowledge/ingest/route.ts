import { z } from "zod";

import {
  getEmbeddingProvider,
} from "@/infrastructure/embeddings/provider-registry";

import {
  FirestoreKnowledgeRepository,
} from "@/infrastructure/repositories/firestore-knowledge-repository";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  source: z.object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(150),

    title: z
      .string()
      .trim()
      .min(1)
      .max(300),

    audience: z
      .enum(["public", "internal"])
      .default("public"),

    status: z
      .enum(["active", "inactive"])
      .default("active"),

    version: z
      .string()
      .trim()
      .min(1)
      .max(50),
  }),

  chunks: z
    .array(
      z.object({
        title: z
          .string()
          .trim()
          .min(1)
          .max(300),

        text: z
          .string()
          .trim()
          .min(1)
          .max(20_000),
      }),
    )
    .min(1)
    .max(100),
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
    const json = await request.json();

    const parsed =
      schema.safeParse(json);

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
      source,
      chunks,
    } = parsed.data;

    const repository =
      new FirestoreKnowledgeRepository();

    const embeddingProvider =
      getEmbeddingProvider();

    await repository.saveSource({
      id: source.id,
      title: source.title,
      audience: source.audience,
      status: source.status,
      version: source.version,
    });

    const results = [];

    for (
      let index = 0;
      index < chunks.length;
      index += 1
    ) {
      const chunk =
        chunks[index];

      const embeddingResult =
        await embeddingProvider
          .embedDocument({
            title: chunk.title,
            text: chunk.text,
          });

      const chunkId =
        `${source.id}-${String(
          index + 1,
        ).padStart(3, "0")}`;

      await repository.saveChunk({
        id: chunkId,
        sourceId: source.id,

        title:
          chunk.title,

        text:
          chunk.text,

        audience:
          source.audience,

        status:
          source.status,

        embedding:
          embeddingResult.embedding,

        embeddingProvider:
          embeddingResult.provider,

        embeddingModel:
          embeddingResult.model,

        embeddingDimensions:
          embeddingResult.dimensions,
      });

      results.push({
        id: chunkId,
        title: chunk.title,
        dimensions:
          embeddingResult.dimensions,
      });
    }

    return Response.json({
      ok: true,
      sourceId: source.id,
      chunksCreated:
        results.length,
      chunks: results,
    });
  } catch (error) {
    console.error(
      "Knowledge ingest failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown knowledge ingest error",
      },
      {
        status: 500,
      },
    );
  }
}