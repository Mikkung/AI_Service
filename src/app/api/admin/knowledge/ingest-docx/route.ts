import * as mammoth from "mammoth";

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

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

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
    const formData =
      await request.formData();

    const file =
      formData.get("file");

    const sourceId =
      String(
        formData.get("sourceId") ?? "",
      ).trim();

    const title =
      String(
        formData.get("title") ?? "",
      ).trim();

    const audienceValue =
      String(
        formData.get("audience") ??
          "public",
      ).trim();

    const version =
      String(
        formData.get("version") ??
          "1",
      ).trim();

    const maxChars =
      Number(
        formData.get("maxChars") ??
          1800,
      );

    const overlapChars =
      Number(
        formData.get("overlapChars") ??
          250,
      );

    if (!(file instanceof File)) {
      return Response.json(
        {
          ok: false,
          error:
            "DOCX file is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!sourceId) {
      return Response.json(
        {
          ok: false,
          error:
            "sourceId is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!title) {
      return Response.json(
        {
          ok: false,
          error:
            "title is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      audienceValue !== "public" &&
      audienceValue !== "internal"
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "audience must be public or internal.",
        },
        {
          status: 400,
        },
      );
    }

    const audience:
      | "public"
      | "internal" =
      audienceValue;

    if (
      file.size <= 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "DOCX must be between 1 byte and 10 MB.",
        },
        {
          status: 400,
        },
      );
    }

    const lowerName =
      file.name.toLowerCase();

    if (!lowerName.endsWith(".docx")) {
      return Response.json(
        {
          ok: false,
          error:
            "Only .docx files are supported.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isInteger(maxChars) ||
      maxChars < 500 ||
      maxChars > 5000
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "maxChars must be an integer between 500 and 5000.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isInteger(
        overlapChars,
      ) ||
      overlapChars < 0 ||
      overlapChars >= maxChars
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "overlapChars must be >= 0 and smaller than maxChars.",
        },
        {
          status: 400,
        },
      );
    }

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(arrayBuffer);

    /*
     * DOCX is a ZIP container.
     * Basic PK signature check.
     */
    if (
      buffer.length < 2 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Uploaded file does not appear to be a valid DOCX file.",
        },
        {
          status: 400,
        },
      );
    }

    const extraction =
      await mammoth.extractRawText({
        buffer,
      });

    const extractedText =
      extraction.value.trim();

    if (!extractedText) {
      return Response.json(
        {
          ok: false,
          error:
            "No readable text was found in the DOCX file.",
        },
        {
          status: 400,
        },
      );
    }

    const chunks =
      chunkText(
        extractedText,
        {
          maxChars,
          overlapChars,
        },
      );

    if (chunks.length === 0) {
      return Response.json(
        {
          ok: false,
          error:
            "No usable chunks were generated.",
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
      id: sourceId,
      title,
      audience,
      status: "active",
      version,
    });

    const savedChunks = [];

    for (const chunk of chunks) {
      const chunkNumber =
        String(
          chunk.index + 1,
        ).padStart(3, "0");

      const chunkId =
        `${sourceId}-${chunkNumber}`;

      const chunkTitle =
        `${title} - Part ${
          chunk.index + 1
        }`;

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

        sourceId,

        title:
          chunkTitle,

        text:
          chunk.text,

        audience,

        status:
          "active",

        embedding:
          embeddingResult.embedding,

        embeddingProvider:
          embeddingResult.provider,

        embeddingModel:
          embeddingResult.model,

        embeddingDimensions:
          embeddingResult.dimensions,
      });

      savedChunks.push({
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

      sourceId,

      title,

      version,

      file: {
        name:
          file.name,

        size:
          file.size,

        type:
          file.type,
      },

      extractedCharacters:
        extractedText.length,

      chunksCreated:
        savedChunks.length,

      extractionWarnings:
        extraction.messages.map(
          (message) =>
            message.message,
        ),

      chunking: {
        maxChars,
        overlapChars,
      },

      chunks:
        savedChunks,
    });
  } catch (error) {
    console.error(
      "DOCX knowledge ingestion failed",
      error,
    );

    return Response.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Unknown DOCX ingestion error",
      },
      {
        status: 500,
      },
    );
  }
}