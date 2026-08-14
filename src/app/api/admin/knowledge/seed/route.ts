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

const TEST_KNOWLEDGE = [
  {
    id: "rag-test-001",
    title: "RAG Test Contact",
    text:
      "สำหรับระบบทดสอบ RAG หากต้องการติดต่อฝ่ายทดสอบ ให้ติดต่อที่หมายเลข 02-000-1111",
  },
  {
    id: "rag-test-002",
    title: "RAG Test Office Hours",
    text:
      "ฝ่ายทดสอบ RAG เปิดให้บริการวันจันทร์ถึงวันศุกร์ เวลา 09:00 ถึง 16:00 น.",
  },
  {
    id: "rag-test-003",
    title: "RAG Test Application Document",
    text:
      "สำหรับระบบทดสอบ RAG เอกสารตัวอย่างที่ต้องใช้คือ Test Form A และ Test Form B",
  },
  {
    id: "rag-test-004",
    title: "RAG Test Fee",
    text:
      "ค่าธรรมเนียมสมมติสำหรับระบบทดสอบ RAG คือ 12,345 บาท",
  },
  {
    id: "rag-test-005",
    title: "RAG Test Location",
    text:
      "สำนักงานสมมติของระบบทดสอบ RAG ตั้งอยู่ที่อาคาร TEST ชั้น 9",
  },
];

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
    const embeddingProvider =
      getEmbeddingProvider();

    const repository =
      new FirestoreKnowledgeRepository();

    const sourceId =
      "rag-test-source-v1";

    await repository.saveSource({
      id: sourceId,
      title:
        "Synthetic RAG Test Knowledge",
      audience: "public",
      status: "active",
      version: "1",
    });

    const results = [];

    for (
      const item of TEST_KNOWLEDGE
    ) {
      const embeddingResult =
        await embeddingProvider
          .embedDocument({
            text: item.text,
            title: item.title,
          });

      await repository.saveChunk({
        id: item.id,
        sourceId,
        title: item.title,
        text: item.text,

        audience: "public",
        status: "active",

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
        id: item.id,
        dimensions:
          embeddingResult.dimensions,
      });
    }

    return Response.json({
      ok: true,
      sourceId,
      chunksCreated:
        results.length,
      chunks: results,
    });
  } catch (error) {
    console.error(
      "Knowledge seed failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown seed error",
      },
      {
        status: 500,
      },
    );
  }
}