import {
  KnowledgeRetriever,
} from "@/core/knowledge/knowledge-retriever";

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
    const body =
      await request.json();

    const query =
      typeof body?.query === "string"
        ? body.query.trim()
        : "";

    if (!query) {
      return Response.json(
        {
          ok: false,
          error:
            "query is required",
        },
        {
          status: 400,
        },
      );
    }

    const retriever =
      new KnowledgeRetriever();

    const results =
      await retriever.retrieve({
        query,
        audience: "public",
        limit: 3,
      });

    return new Response(
      JSON.stringify({
        ok: true,
        query,
        results,
    }),
    {
      status:200,
      headers:{
        "Content-Type":
          "application/json; charset=utf-8"
      },
    },
  );
  } catch (error) {
    console.error(
      "Retrieval test failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown retrieval error",
      },
      {
        status: 500,
      },
    );
  }
}