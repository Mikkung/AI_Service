import {
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

import type {
  ApprovedKnowledgePublicationInput,
  ApprovedKnowledgePublicationResult,
  PublishApprovedKnowledge,
} from "@/core/ai-platform/integrations/sharepoint/approved-knowledge-publication";

export const MAX_SHAREPOINT_PUBLICATION_FILE_BYTES =
  8 * 1024 * 1024;

const payloadSchema = z.object({
  sourceSystem: z
    .literal("sharepoint"),
  sourceItemId: z
    .string()
    .trim()
    .min(1),
  sourceVersion: z
    .string()
    .trim()
    .min(1)
    .optional(),
  fileName: z
    .string()
    .trim()
    .min(1),
  contentBase64: z
    .string()
    .min(1),
  audience: z.enum([
    "public",
    "internal",
  ]),
  knowledgeCategory: z
    .string()
    .trim()
    .min(1)
    .optional(),
  knowledgeOwner: z
    .string()
    .trim()
    .min(1)
    .optional(),
  knowledgeVersion: z
    .string()
    .trim()
    .min(1)
    .optional(),
  effectiveFrom: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),
  effectiveTo: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),
  approvalStatus: z
    .string()
    .trim()
    .min(1),
  sourceModifiedAt: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),
});

export type PowerAutomatePublicationPayload =
  z.infer<typeof payloadSchema>;

export interface HandleSharePointPublicationRequestOptions {
  secret?: string;
  useCase: Pick<
    PublishApprovedKnowledge,
    "execute"
  >;
  maxFileBytes?: number;
}

function unauthorizedResponse(): Response {
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

function forbiddenResponse(): Response {
  return Response.json(
    {
      ok: false,
      error: "Forbidden",
    },
    {
      status: 403,
    },
  );
}

function extractBearerToken(
  authorization: string | null,
): string | null {
  const match =
    /^Bearer\s+(.+)$/i.exec(
      authorization ?? "",
    );

  return match?.[1] ?? null;
}

function safeSecretEquals(
  received: string,
  expected: string,
): boolean {
  const receivedBuffer =
    Buffer.from(received);
  const expectedBuffer =
    Buffer.from(expected);

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    receivedBuffer,
    expectedBuffer,
  );
}

export function isAuthorizedSharePointPublicationRequest(input: {
  authorization: string | null;
  secret?: string;
}): boolean | "not_configured" {
  if (!input.secret) {
    return "not_configured";
  }

  const token =
    extractBearerToken(
      input.authorization,
    );

  if (!token) {
    return false;
  }

  return safeSecretEquals(
    token,
    input.secret,
  );
}

function decodeBase64Content(
  value: string,
): Buffer | null {
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      value.replace(/\s/g, ""),
    )
  ) {
    return null;
  }

  const buffer =
    Buffer.from(value, "base64");

  return buffer.length > 0
    ? buffer
    : null;
}

export function parsePowerAutomatePublicationPayload(
  body: unknown,
  maxFileBytes = MAX_SHAREPOINT_PUBLICATION_FILE_BYTES,
):
  | {
      ok: true;
      input: ApprovedKnowledgePublicationInput;
    }
  | {
      ok: false;
      status: number;
      error: string;
      issues?: unknown;
    } {
  const parsed =
    payloadSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Invalid request payload",
      issues:
        parsed.error.flatten(),
    };
  }

  const roughDecodedBytes =
    Math.floor(
      (parsed.data.contentBase64
        .replace(/\s/g, "")
        .length *
        3) /
        4,
    );

  if (roughDecodedBytes > maxFileBytes) {
    return {
      ok: false,
      status: 413,
      error:
        "Publication file exceeds maximum allowed size",
    };
  }

  const content =
    decodeBase64Content(
      parsed.data.contentBase64,
    );

  if (!content) {
    return {
      ok: false,
      status: 400,
      error:
        "contentBase64 must be valid base64 file content",
    };
  }

  if (content.length > maxFileBytes) {
    return {
      ok: false,
      status: 413,
      error:
        "Publication file exceeds maximum allowed size",
    };
  }

  return {
    ok: true,
    input: {
      ...parsed.data,
      content,
    },
  };
}

export async function handleSharePointPublicationRequest(
  request: Request,
  options: HandleSharePointPublicationRequestOptions,
): Promise<Response> {
  const auth =
    isAuthorizedSharePointPublicationRequest({
      authorization:
        request.headers.get(
          "authorization",
        ),
      secret:
        options.secret,
    });

  if (auth === "not_configured") {
    return forbiddenResponse();
  }

  if (!auth) {
    return unauthorizedResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "Request body must be valid JSON",
      },
      {
        status: 400,
      },
    );
  }

  const parsed =
    parsePowerAutomatePublicationPayload(
      body,
      options.maxFileBytes,
    );

  if (!parsed.ok) {
    return Response.json(
      {
        ok: false,
        error:
          parsed.error,
        issues:
          parsed.issues,
      },
      {
        status:
          parsed.status,
      },
    );
  }

  const result: ApprovedKnowledgePublicationResult =
    await options.useCase.execute(
      parsed.input,
    );

  return Response.json({
    ok: true,
    ...result,
  });
}
