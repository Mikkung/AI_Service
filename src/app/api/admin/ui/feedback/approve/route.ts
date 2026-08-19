import {
  z,
} from "zod";

import {
  ApprovedQaService,
} from "@/core/admin-ai/approved-qa-service";

import {
  hasValidAdminUiSession,
} from "@/lib/http/admin-ui-session";

export const runtime = "nodejs";
export const dynamic =
  "force-dynamic";

const service =
  new ApprovedQaService();

const requestSchema = z.object({
  feedbackId:
    z.string()
      .trim()
      .min(1),
  canonicalQuestion:
    z.string()
      .trim()
      .min(1)
      .max(4_000),
  approvedAnswer:
    z.string()
      .trim()
      .min(1)
      .max(12_000),
  topic:
    z.string()
      .trim()
      .max(200)
      .optional(),
  audience:
    z.enum([
      "public",
      "internal",
    ])
      .default("public"),
  academicYear:
    z.string()
      .trim()
      .max(50)
      .optional(),
});

export async function POST(
  request: Request,
) {
  if (
    !hasValidAdminUiSession(
      request,
    )
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "Admin session expired.",
      },
      { status: 401 },
    );
  }

  let json: unknown;

  try {
    json =
      await request.json();
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
    requestSchema.safeParse(
      json,
    );

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error:
          "Invalid approval request.",
        issues:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const approved =
      await service
        .approveFeedback({
          feedbackId:
            parsed.data.feedbackId,
          canonicalQuestion:
            parsed.data
              .canonicalQuestion,
          approvedAnswer:
            parsed.data
              .approvedAnswer,
          topic:
            parsed.data.topic,
          audience:
            parsed.data.audience,
          academicYear:
            parsed.data
              .academicYear,
          approvedBy:
            "admin-ui",
        });

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

    return Response.json(
      {
        ok: false,
        error: message,
      },
      {
        status:
          message.includes(
            "not found",
          )
            ? 404
            : 400,
      },
    );
  }
}
