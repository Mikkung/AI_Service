import { z } from "zod";

import {
  FirestoreAdminReviewRepository,
} from "@/infrastructure/repositories/firestore-admin-review-repository";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository =
  new FirestoreAdminReviewRepository();

const requestSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum([
    "review",
    "reject",
  ]),
  correctedQuestion:
    z.string().trim().min(1).max(4_000).optional(),
  correctedAnswer:
    z.string().trim().min(1).max(12_000).optional(),
  adminNote:
    z.string().trim().max(4_000).optional(),
  reviewedBy:
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

  const existing =
    await repository
      .getHistoricalQa(
        parsed.data.id,
      );

  if (!existing) {
    return Response.json(
      {
        ok: false,
        error:
          "Historical Q&A record not found.",
      },
      { status: 404 },
    );
  }

  await repository
    .reviewHistoricalQa({
      id: parsed.data.id,
      status:
        parsed.data.action ===
        "reject"
          ? "rejected"
          : "reviewed",
      correctedQuestion:
        parsed.data.correctedQuestion,
      correctedAnswer:
        parsed.data.correctedAnswer,
      adminNote:
        parsed.data.adminNote,
      reviewedBy:
        parsed.data.reviewedBy,
    });

  return Response.json({
    ok: true,
    id: parsed.data.id,
    reviewStatus:
      parsed.data.action ===
      "reject"
        ? "rejected"
        : "reviewed",
    knowledgeUpdated: false,
  });
}
