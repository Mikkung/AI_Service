import {
  GoogleGenAI,
  Type,
} from "@google/genai";

import {
  parseDocumentQAResponse,
} from "@/core/experiments/document-qa/structured-output";

import type {
  DocumentQAInput,
  DocumentQAOutput,
  DocumentQAProvider,
} from "@/core/experiments/document-qa/types";

const DEFAULT_MODEL =
  "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = [
  "You answer questions using only the supplied source document.",
  "If the source document answers the question, set answerable to true and answer concisely.",
  "If the source document does not answer the question, set answerable to false, answer with a brief missing-information statement, and use an empty evidence array.",
  "Every evidence item must be copied exactly from the source document.",
  "Do not use outside knowledge.",
].join("\n");

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answerable: {
      type: Type.BOOLEAN,
    },
    answer: {
      type: Type.STRING,
    },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: {
            type: Type.STRING,
          },
        },
        required: [
          "text",
        ],
      },
    },
  },
  required: [
    "answerable",
    "answer",
    "evidence",
  ],
};

export interface GeminiDocumentQAProviderOptions {
  apiKey?: string;
  model?: string;
}

export class GeminiDocumentQAProvider
  implements DocumentQAProvider
{
  readonly name = "gemini";

  private readonly apiKey?: string;

  readonly model: string;

  constructor(
    options: GeminiDocumentQAProviderOptions = {},
  ) {
    this.apiKey =
      options.apiKey ??
      process.env.GEMINI_API_KEY;

    this.model =
      options.model ??
      process.env.EXPERIMENT_GEMINI_MODEL ??
      DEFAULT_MODEL;
  }

  async answer(
    input: DocumentQAInput,
  ): Promise<DocumentQAOutput> {
    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY is required for the Gemini document QA provider",
      );
    }

    const ai =
      new GoogleGenAI({
        apiKey: this.apiKey,
      });

    const response =
      await ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "Question:",
                  input.question,
                  "",
                  "Source document:",
                  input.sourceText,
                ].join("\n"),
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            SYSTEM_INSTRUCTION,
          temperature: 0,
          responseMimeType:
            "application/json",
          responseSchema:
            RESPONSE_SCHEMA,
        },
      });

    return parseDocumentQAResponse(
      response.text ?? "",
      {
        provider: this.name,
        model: this.model,
        finishReason:
          response.candidates?.[0]
            ?.finishReason,
        usage: {
          inputTokens:
            response.usageMetadata
              ?.promptTokenCount,
          outputTokens:
            response.usageMetadata
              ?.candidatesTokenCount,
          totalTokens:
            response.usageMetadata
              ?.totalTokenCount,
        },
      },
    );
  }
}
