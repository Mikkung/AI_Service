import { z } from "zod";

import {
  ApprovedQaService,
} from "@/core/admin-ai/approved-qa-service";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service =
  new ApprovedQaService();

const requestSchema = z.object({
  historyId:
    z.string().trim().min(1),
  canonicalQuestion:
    z.string().trim().min(1).max(4_000).optional(),
  approvedAnswer:
    z.string().trim().min(1).max(12_000).optional(),
  topic:
    z.string().trim().max(200).optional(),
  audience:
    z.enum([
      "public",
      "internal",
    ]).default("public"),
  academicYear:
    z.string().trim().max(50).optional(),
  officialSource:
    z.string().trim().max(2_000).optional(),
  approvedBy:
    z.string().trim().min(1).max(200),
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
      { status: 401 },
    );
  }

  let json: unknown;

  try {
    json = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const parsed =
    requestSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Invalid request.",
        issues:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const approved =
      await service
        .promoteHistoricalQa(
          parsed.data,
        );

    return Response.json({
      ok: true,
      approved,
      knowledgeUpdated: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error";

    const notFound =
      message.includes(
        "not found",
      );

    return Response.json(
      {
        ok: false,
        error: message,
      },
      {
        status:
          notFound ? 404 : 400,
      },
    );
  }
}
