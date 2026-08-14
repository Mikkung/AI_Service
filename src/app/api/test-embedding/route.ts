import {
  getEmbeddingProvider,
} from "@/infrastructure/embeddings/provider-registry";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const body = await request.json();

    const text =
      typeof body?.text === "string"
        ? body.text.trim()
        : "";

    if (!text) {
      return Response.json(
        {
          ok: false,
          error: "text is required",
        },
        {
          status: 400,
        },
      );
    }

    const provider =
      getEmbeddingProvider();

    const result =
      await provider.embedQuery({
        text,
      });

    return Response.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      dimensions: result.dimensions,

      // Debug only:
      preview:
        result.embedding.slice(0, 5),
    });
  } catch (error) {
    console.error(
      "Embedding test failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown embedding error",
      },
      {
        status: 500,
      },
    );
  }
}