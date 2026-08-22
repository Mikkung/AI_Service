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

const rawHeaderSchema = z.object({
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
    .optional(),
  effectiveTo: z
    .string()
    .trim()
    .min(1)
    .optional(),
  approvalStatus: z
    .string()
    .trim()
    .min(1),
  sourceModifiedAt: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

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

function optionalHeader(
  headers: Headers,
  name: string,
): string | undefined {
  return (
    headers.get(name)?.trim() ||
    undefined
  );
}

function requiredRawMetadataFromHeaders(
  headers: Headers,
):
  | {
      ok: true;
      metadata: Omit<
        ApprovedKnowledgePublicationInput,
        "content"
      >;
    }
  | {
      ok: false;
      status: number;
      error: string;
      issues?: unknown;
    } {
  const parsed =
    rawHeaderSchema.safeParse({
      sourceSystem:
        optionalHeader(
          headers,
          "x-ise-source-system",
        ),
      sourceItemId:
        optionalHeader(
          headers,
          "x-ise-source-item-id",
        ),
      sourceVersion:
        optionalHeader(
          headers,
          "x-ise-source-version",
        ),
      fileName:
        optionalHeader(
          headers,
          "x-ise-file-name",
        ),
      audience:
        optionalHeader(
          headers,
          "x-ise-audience",
        ),
      knowledgeCategory:
        optionalHeader(
          headers,
          "x-ise-knowledge-category",
        ),
      knowledgeOwner:
        optionalHeader(
          headers,
          "x-ise-knowledge-owner",
        ),
      knowledgeVersion:
        optionalHeader(
          headers,
          "x-ise-knowledge-version",
        ),
      effectiveFrom:
        optionalHeader(
          headers,
          "x-ise-effective-from",
        ),
      effectiveTo:
        optionalHeader(
          headers,
          "x-ise-effective-to",
        ),
      approvalStatus:
        optionalHeader(
          headers,
          "x-ise-approval-status",
        ),
      sourceModifiedAt:
        optionalHeader(
          headers,
          "x-ise-source-modified-at",
        ),
    });

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error:
        "Invalid raw publication metadata headers",
      issues:
        parsed.error.flatten(),
    };
  }

  return {
    ok: true,
    metadata:
      parsed.data,
  };
}

function isRawBinaryRequest(
  request: Request,
): boolean {
  const explicitTransport =
    request.headers
      .get("x-ise-transport")
      ?.trim()
      .toLowerCase();
  const contentType =
    request.headers
      .get("content-type")
      ?.toLowerCase() ?? "";

  return (
    explicitTransport ===
      "raw-binary" ||
    contentType.includes(
      "application/octet-stream",
    )
  );
}

export async function parseRawPowerAutomatePublicationRequest(
  request: Request,
  maxFileBytes = MAX_SHAREPOINT_PUBLICATION_FILE_BYTES,
):
  Promise<
    | {
        ok: true;
        input: ApprovedKnowledgePublicationInput;
      }
    | {
        ok: false;
        status: number;
        error: string;
        issues?: unknown;
      }
  > {
  const metadata =
    requiredRawMetadataFromHeaders(
      request.headers,
    );

  if (!metadata.ok) {
    return metadata;
  }

  const contentLength =
    request.headers.get(
      "content-length",
    );

  if (
    contentLength &&
    Number(contentLength) >
      maxFileBytes
  ) {
    return {
      ok: false,
      status: 413,
      error:
        "Publication file exceeds maximum allowed size",
    };
  }

  const content =
    Buffer.from(
      await request.arrayBuffer(),
    );

  if (content.length === 0) {
    return {
      ok: false,
      status: 400,
      error:
        "Raw publication body cannot be empty",
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
      ...metadata.metadata,
      effectiveFrom:
        metadata.metadata
          .effectiveFrom ?? null,
      effectiveTo:
        metadata.metadata
          .effectiveTo ?? null,
      sourceModifiedAt:
        metadata.metadata
          .sourceModifiedAt ?? null,
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

  if (isRawBinaryRequest(request)) {
    const parsed =
      await parseRawPowerAutomatePublicationRequest(
        request,
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
