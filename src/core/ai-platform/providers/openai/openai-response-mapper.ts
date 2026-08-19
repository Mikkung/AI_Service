import type {
  OpenAIRetrievalDiagnosticResult,
  OpenAIRetrievalDiagnostics,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

import type {
  Citation,
} from "@/core/ai-platform/types/citations";

import type {
  GroundedQAResult,
  GroundedQAUsage,
} from "@/core/ai-platform/types/grounded-answer";

export const UNSUPPORTED_BY_KB =
  "UNSUPPORTED_BY_KB";

interface MapOpenAIResponseInput {
  response: unknown;
  provider: string;
  model: string;
  latencyMs?: number;
}

interface MappedOpenAIResponse {
  result: GroundedQAResult;
  retrieval: OpenAIRetrievalDiagnostics;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function asString(
  value: unknown,
): string | undefined {
  return typeof value === "string"
    ? value
    : undefined;
}

function asNumber(
  value: unknown,
): number | undefined {
  return typeof value === "number"
    ? value
    : undefined;
}

function getOutputItems(
  response: unknown,
): Record<string, unknown>[] {
  if (!isRecord(response)) {
    return [];
  }

  const output =
    response.output;

  return Array.isArray(output)
    ? output.filter(isRecord)
    : [];
}

function extractAnswerText(
  response: unknown,
): string {
  if (
    isRecord(response) &&
    typeof response.output_text ===
      "string"
  ) {
    return response.output_text.trim();
  }

  const parts: string[] = [];

  for (const item of getOutputItems(response)) {
    const content =
      item.content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (
        isRecord(part) &&
        typeof part.text === "string"
      ) {
        parts.push(part.text);
      }
    }
  }

  return parts.join("").trim();
}

function extractCitations(
  response: unknown,
): Citation[] {
  const citations: Citation[] = [];

  for (const item of getOutputItems(response)) {
    const content =
      item.content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!isRecord(part)) {
        continue;
      }

      const annotations =
        part.annotations;

      if (!Array.isArray(annotations)) {
        continue;
      }

      for (const annotation of annotations) {
        if (!isRecord(annotation)) {
          continue;
        }

        const type =
          asString(annotation.type);

        if (
          type !== "file_citation" &&
          type !==
            "container_file_citation"
        ) {
          continue;
        }

        citations.push({
          externalFileId:
            asString(
              annotation.file_id,
            ),
          filename:
            asString(
              annotation.filename,
            ),
          providerMetadata: {
            annotationType:
              type,
            index:
              annotation.index,
          },
        });
      }
    }
  }

  const seen =
    new Set<string>();

  return citations.filter(
    (citation) => {
      const key = [
        citation.externalFileId ?? "",
        citation.filename ?? "",
      ].join(":");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    },
  );
}

function extractRetrievalDiagnostics(
  response: unknown,
): OpenAIRetrievalDiagnostics {
  const queries: string[] = [];
  const results: OpenAIRetrievalDiagnosticResult[] =
    [];

  for (const item of getOutputItems(response)) {
    if (
      item.type !== "file_search_call"
    ) {
      continue;
    }

    const query =
      asString(item.query);

    if (query) {
      queries.push(query);
    }

    const rawResults =
      item.results;

    if (!Array.isArray(rawResults)) {
      continue;
    }

    for (const rawResult of rawResults) {
      if (!isRecord(rawResult)) {
        continue;
      }

      const content =
        rawResult.content;

      let snippet: string | undefined;

      if (Array.isArray(content)) {
        snippet = content
          .filter(isRecord)
          .map((part) =>
            asString(part.text),
          )
          .filter(
            (
              part,
            ): part is string =>
              Boolean(part),
          )
          .join("\n")
          .slice(0, 600);
      }

      results.push({
        query,
        fileId:
          asString(rawResult.file_id),
        filename:
          asString(rawResult.filename),
        score:
          asNumber(rawResult.score),
        snippet,
      });
    }
  }

  return {
    queries,
    results,
  };
}

function extractUsage(
  response: unknown,
): GroundedQAUsage | undefined {
  if (!isRecord(response)) {
    return undefined;
  }

  const usage =
    response.usage;

  if (!isRecord(usage)) {
    return undefined;
  }

  const mapped = {
    inputTokens:
      asNumber(
        usage.input_tokens,
      ),
    outputTokens:
      asNumber(
        usage.output_tokens,
      ),
    totalTokens:
      asNumber(
        usage.total_tokens,
      ),
  };

  return Object.values(mapped).some(
    (value) => value !== undefined,
  )
    ? mapped
    : undefined;
}

export function mapOpenAIResponseToGroundedQAResult(
  input: MapOpenAIResponseInput,
): MappedOpenAIResponse {
  const answer =
    extractAnswerText(input.response);

  const retrieval =
    extractRetrievalDiagnostics(
      input.response,
    );

  if (
    answer.includes(UNSUPPORTED_BY_KB)
  ) {
    return {
      result: {
        answerable: false,
        answer: "",
        citations: [],
        provider:
          input.provider,
        model:
          input.model,
        usage:
          extractUsage(
            input.response,
          ),
        latencyMs:
          input.latencyMs,
        providerMetadata: {
          unsupportedToken:
            UNSUPPORTED_BY_KB,
          retrieval,
        },
      },
      retrieval,
    };
  }

  return {
    result: {
      answerable: true,
      answer,
      citations:
        extractCitations(
          input.response,
        ),
      provider:
        input.provider,
      model:
        input.model,
      usage:
        extractUsage(
          input.response,
        ),
      latencyMs:
        input.latencyMs,
      providerMetadata: {
        retrieval,
      },
    },
    retrieval,
  };
}
