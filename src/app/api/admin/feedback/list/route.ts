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

const querySchema = z.object({
  status: z
    .enum([
      "pending",
      "reviewed",
      "approved",
      "rejected",
    ])
    .default("pending"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
});

export async function GET(
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

  const url = new URL(request.url);

  const parsed =
    querySchema.safeParse({
      status:
        url.searchParams.get(
          "status",
        ) ?? undefined,
      limit:
        url.searchParams.get(
          "limit",
        ) ?? undefined,
    });

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Invalid query.",
        issues:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const items =
      await repository
        .listFeedback(
          parsed.data,
        );

    return Response.json({
      ok: true,
      status:
        parsed.data.status,
      count:
        items.length,
      items,
    });
  } catch (error) {
    console.error(
      "GET /api/admin/feedback/list failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          "Could not load feedback.",
        details:
          process.env.NODE_ENV ===
          "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error"
            : undefined,
      },
      { status: 500 },
    );
  }
}
