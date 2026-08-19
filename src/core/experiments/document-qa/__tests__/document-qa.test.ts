import assert from "node:assert/strict";

import {
  normalizeEvidenceText,
  verifyDocumentQAEvidence,
} from "../evidence-verifier";

import {
  loadFullSourceDocument,
} from "../full-source-loader";

import {
  getDocumentQAProvider,
  listDocumentQAProviderNames,
} from "../provider-registry";

import {
  MalformedDocumentQAResponseError,
  parseDocumentQAResponse,
} from "../structured-output";

import type {
  KnowledgeChunk,
} from "@/core/knowledge/types";

function chunk(
  id: string,
  text: string,
): KnowledgeChunk {
  return {
    id,
    sourceId:
      "ise-ay2027",
    title:
      id,
    text,
    audience:
      "public",
    status:
      "active",
    embedding: [],
    embeddingProvider:
      "test",
    embeddingModel:
      "test",
    embeddingDimensions:
      0,
  };
}

async function testFullSourceLoader() {
  const calls: Array<{
    sourceId: string;
    audience: string;
  }> = [];

  const loaded =
    await loadFullSourceDocument({
      sourceId:
        "ise-ay2027",
      repository: {
        async getActiveChunksBySource(
          sourceId,
          audience,
        ) {
          calls.push({
            sourceId,
            audience,
          });

          return [
            chunk("part-002", "Second"),
            chunk("part-001", " First "),
          ];
        },
      },
    });

  assert.deepEqual(calls, [
    {
      sourceId:
        "ise-ay2027",
      audience:
        "public",
    },
  ]);

  assert.equal(
    loaded.sourceText,
    "First\n\nSecond",
  );
  assert.equal(
    loaded.sourceChunkCount,
    2,
  );
  assert.equal(
    loaded.sourceCharacterCount,
    "First\n\nSecond".length,
  );
}

function testEvidenceVerifier() {
  const source =
    "Line one\r\nThe fee is\u00a0800 baht.";

  assert.equal(
    normalizeEvidenceText(source),
    "Line one The fee is 800 baht.",
  );

  assert.equal(
    verifyDocumentQAEvidence(
      {
        answerable: true,
        evidence: [
          {
            text:
              "The fee is 800 baht.",
          },
        ],
      },
      source,
    ),
    true,
  );

  assert.equal(
    verifyDocumentQAEvidence(
      {
        answerable: true,
        evidence: [],
      },
      source,
    ),
    false,
  );

  assert.equal(
    verifyDocumentQAEvidence(
      {
        answerable: false,
        evidence: [],
      },
      source,
    ),
    true,
  );

  assert.equal(
    verifyDocumentQAEvidence(
      {
        answerable: false,
        evidence: [
          {
            text:
              "The fee is 800 baht.",
          },
        ],
      },
      source,
    ),
    false,
  );
}

function testStructuredOutputParser() {
  const output =
    parseDocumentQAResponse(
      JSON.stringify({
        answerable: true,
        answer:
          "The fee is 800 baht.",
        evidence: [
          {
            text:
              "The fee is 800 baht.",
          },
        ],
      }),
      {
        provider:
          "unit",
        model:
          "mock",
        finishReason:
          "STOP",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      },
    );

  assert.deepEqual(output, {
    answerable: true,
    answer:
      "The fee is 800 baht.",
    evidence: [
      {
        text:
          "The fee is 800 baht.",
      },
    ],
    provider:
      "unit",
    model:
      "mock",
    finishReason:
      "STOP",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  });

  assert.throws(
    () =>
      parseDocumentQAResponse(
        "{",
        {
          provider:
            "unit",
          model:
            "mock",
        },
      ),
    MalformedDocumentQAResponseError,
  );
}

function testRegistry() {
  assert.deepEqual(
    listDocumentQAProviderNames(),
    [
      "gemini",
    ],
  );

  assert.equal(
    getDocumentQAProvider(
      "GEMINI",
    ).name,
    "gemini",
  );

  assert.throws(
    () =>
      getDocumentQAProvider(
        "unknown",
      ),
    /Unsupported document QA provider/,
  );
}

async function main() {
  await testFullSourceLoader();
  testEvidenceVerifier();
  testStructuredOutputParser();
  testRegistry();

  console.log(
    "document-qa unit tests passed",
  );
}

void main();
