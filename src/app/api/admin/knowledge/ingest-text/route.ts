import { z } from "zod";

import {
  chunkText,
} from "@/core/knowledge/text-chunker";

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
      .enum([
        "public",
        "internal",
      ])
      .default("public"),

    status: z
      .enum([
        "active",
        "inactive",
      ])
      .default("active"),

    version: z
      .string()
      .trim()
      .min(1)
      .max(50),
  }),

  text: z
    .string()
    .trim()
    .min(1)
    .max(500_000),

  chunking: z
    .object({
      maxChars: z
        .number()
        .int()
        .min(500)
        .max(5000)
        .default(1800),

      overlapChars: z
        .number()
        .int()
        .min(0)
        .max(1000)
        .default(250),
    })
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

  try {
    const body =
      await request.json();

    const parsed =
      schema.safeParse(body);

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
      source,
      text,
      chunking,
    } = parsed.data;

    const chunks =
      chunkText(
        text,
        {
          maxChars:
            chunking?.maxChars ??
            1800,

          overlapChars:
            chunking?.overlapChars ??
            250,
        },
      );

    if (chunks.length === 0) {
      return Response.json(
        {
          ok: false,
          error:
            "No usable text found.",
        },
        {
          status: 400,
        },
      );
    }

    const repository =
      new FirestoreKnowledgeRepository();

    const embeddingProvider =
      getEmbeddingProvider();

    await repository.saveSource({
      id: source.id,
      title: source.title,
      audience:
        source.audience,
      status:
        source.status,
      version:
        source.version,
    });

    const results = [];

    for (
      const chunk of chunks
    ) {
      const chunkNumber =
        String(
          chunk.index + 1,
        ).padStart(3, "0");

      const chunkId =
        `${source.id}-${chunkNumber}`;

      const chunkTitle =
        `${source.title} - Part ${chunk.index + 1}`;

      const embeddingResult =
        await embeddingProvider
          .embedDocument({
            title:
              chunkTitle,

            text:
              chunk.text,
          });

      await repository.saveChunk({
        id:
          chunkId,

        sourceId:
          source.id,

        title:
          chunkTitle,

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
        id:
          chunkId,

        chars:
          chunk.text.length,

        dimensions:
          embeddingResult.dimensions,
      });
    }

    return Response.json({
      ok: true,

      sourceId:
        source.id,

      sourceTitle:
        source.title,

      totalCharacters:
        text.length,

      chunksCreated:
        results.length,

      chunking: {
        maxChars:
          chunking?.maxChars ??
          1800,

        overlapChars:
          chunking?.overlapChars ??
          250,
      },

      chunks:
        results,
    });
  } catch (error) {
    console.error(
      "Text knowledge ingestion failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown ingestion error",
      },
      {
        status: 500,
      },
    );
  }
}