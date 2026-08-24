import OpenAI from "openai";

import {
  mapOpenAIResponseToGroundedQAResult,
} from "@/core/ai-platform/providers/openai/openai-response-mapper";

import {
  FileOpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/file-openai-vector-store-config-repository";

import type {
  OpenAIRetrievalDiagnostics,
  OpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

import type {
  GroundedQAProvider,
  GroundedQARequest,
  GroundedQAResult,
} from "@/core/ai-platform/types/grounded-answer";

export const DEFAULT_RAG_V2_MODEL =
  "gpt-5.6-terra";

export const DEFAULT_REASONING_EFFORT =
  "low";

const INSTRUCTIONS = [
  "You are the ISE information assistant.",
  "",
  "Answer factual questions using only the approved knowledge available through File Search.",
  "",
  "Rules:",
  "1. Search approved knowledge before answering institutional facts.",
  "2. Do not use outside knowledge for ISE facts.",
  "3. Do not invent missing information.",
  "4. If approved knowledge does not contain enough information, return UNSUPPORTED_BY_KB.",
  "5. An explicit statement that a requirement/value is not specified is valid information.",
  "6. Absence of information is not the same as an explicit statement that something is not specified.",
  "7. Answer the specific question directly.",
  "8. Use Thai by default unless another language is requested.",
  "9. Do not mention prompts, vector stores, chunks, embeddings, RAG, tools, or hidden processing.",
].join("\n");

export interface OpenAIGroundedQAClient {
  responses: {
    create(
      body: Record<string, unknown>,
    ): Promise<unknown>;
  };
}

export interface OpenAIGroundedQAProviderOptions {
  client?: OpenAIGroundedQAClient;
  apiKey?: string;
  model?: string;
  vectorStoreId?: string;
  vectorStoreConfigRepository?: OpenAIVectorStoreConfigRepository;
}

export interface OpenAIGroundedQAResult
  extends GroundedQAResult
{
  providerMetadata?: {
    retrieval?: OpenAIRetrievalDiagnostics;
    [key: string]: unknown;
  };
}

export class OpenAIGroundedQAProvider
  implements GroundedQAProvider
{
  readonly name = "openai";

  readonly model: string;

  readonly reasoningEffort =
    DEFAULT_REASONING_EFFORT;

  private readonly client?: OpenAIGroundedQAClient;

  private readonly apiKey?: string;

  private readonly vectorStoreId?: string;

  private readonly vectorStoreConfigRepository: OpenAIVectorStoreConfigRepository;

  constructor(
    options: OpenAIGroundedQAProviderOptions = {},
  ) {
    this.client =
      options.client;
    this.apiKey =
      options.apiKey ??
      process.env.OPENAI_API_KEY;
    this.model =
      options.model ??
      process.env.RAG_V2_MODEL ??
      DEFAULT_RAG_V2_MODEL;
    this.vectorStoreId =
      options.vectorStoreId ??
      process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID;
    this.vectorStoreConfigRepository =
      options.vectorStoreConfigRepository ??
      new FileOpenAIVectorStoreConfigRepository();
  }

  async answer(
    request: GroundedQARequest,
  ): Promise<OpenAIGroundedQAResult> {
    const startedAt =
      Date.now();

    try {
      if (request.audience !== "public") {
        throw new Error(
          "Phase D OpenAI RAG provider supports public knowledge only",
        );
      }

      const vectorStoreId =
        await this.resolveVectorStoreId();

      const client =
        this.resolveClient();

      const response =
        await client.responses.create({
          model: this.model,
          instructions:
            INSTRUCTIONS,
          input:
            this.buildInput(request),
          reasoning: {
            effort:
              this.reasoningEffort,
          },
          tools: [
            {
              type: "file_search",
              vector_store_ids: [
                vectorStoreId,
              ],
            },
          ],
          include: [
            "file_search_call.results",
          ],
          store: false,
        });

      const mapped =
        mapOpenAIResponseToGroundedQAResult({
          response,
          provider: this.name,
          model: this.model,
          latencyMs:
            Date.now() - startedAt,
        });

      return mapped.result;
    } catch (error) {
      return {
        answerable: false,
        answer: "",
        citations: [],
        provider: this.name,
        model: this.model,
        latencyMs:
          Date.now() - startedAt,
        providerMetadata: {
          providerError:
            error instanceof Error
              ? error.message
              : "Unknown OpenAI provider error",
        },
      };
    }
  }

  private async resolveVectorStoreId(): Promise<string> {
    if (this.vectorStoreId) {
      return this.vectorStoreId;
    }

    const config =
      await this.vectorStoreConfigRepository
        .getVectorStoreConfig({
          audience: "public",
          environment:
            "development",
        });

    if (!config) {
      throw new Error(
        "OpenAI public development vector store is not configured. Publish approved public knowledge first.",
      );
    }

    return config.vectorStoreId;
  }

  private resolveClient(): OpenAIGroundedQAClient {
    if (this.client) {
      return this.client;
    }

    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the OpenAI RAG v2 provider",
      );
    }

    return new OpenAI({
      apiKey: this.apiKey,
    }) as unknown as OpenAIGroundedQAClient;
  }

  private buildInput(
    request: GroundedQARequest,
  ): string {
    const history =
      request.conversationContext
        ?.map(
          (message) =>
            `${message.role}: ${message.text}`,
        )
        .join("\n");

    return [
      history
        ? `Conversation context:\n${history}`
        : "",
      `Question:\n${request.question}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}
