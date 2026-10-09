import OpenAI from "openai";

import type {
  ImageUnderstandingProvider,
  ImageUnderstandingRequest,
  ImageUnderstandingResult,
} from "@/core/ai-platform/media/image-understanding-provider";

import type {
  MediaCategory,
  MediaSensitivity,
} from "@/core/ai-platform/types/media";

export const DEFAULT_MEDIA_VISION_MODEL =
  "gpt-4.1-mini";

const CATEGORIES = new Set<MediaCategory>([
  "general_image",
  "screenshot",
  "document",
  "score_report",
  "transcript",
  "identity_document",
  "application_screen",
  "other",
]);

const SENSITIVITIES =
  new Set<MediaSensitivity>([
    "none",
    "personal",
    "sensitive",
  ]);

const INSTRUCTIONS = [
  "You extract privacy-safe conversation context from a user-supplied image.",
  "Return only information necessary for customer-service assistance.",
  "Never retain or reproduce citizen ID numbers, passport numbers, government identifiers, candidate or registration IDs, full home addresses, phone numbers, personal email addresses, signatures, passwords, credentials, or payment card numbers.",
  "For score reports, retain only exam/test name, subject/component, scores, bands, levels, and an exam date when clearly relevant.",
  "For transcripts, retain academically relevant subjects and grades, but omit identity fields.",
  "For identity documents, use only the safe placeholder that an identity document was supplied.",
  "Do not infer or identify a person. Do not invent unreadable values. Mark uncertainty briefly.",
].join("\n");

const DEFAULT_VISION_TIMEOUT_MS =
  12_000;

export interface OpenAIImageUnderstandingClient {
  responses: {
    create(
      body: Record<string, unknown>,
      options?: {
        signal?: AbortSignal;
      },
    ): Promise<unknown>;
  };
}

export interface OpenAIImageUnderstandingProviderOptions {
  client?: OpenAIImageUnderstandingClient;
  apiKey?: string;
  model?: string;
  requestTimeoutMs?: number;
}

export class OpenAIImageUnderstandingProvider
  implements ImageUnderstandingProvider
{
  readonly name = "openai";

  readonly model: string;

  private readonly client?: OpenAIImageUnderstandingClient;

  private readonly apiKey?: string;

  private readonly requestTimeoutMs: number;

  constructor(
    options: OpenAIImageUnderstandingProviderOptions = {},
  ) {
    this.client = options.client;
    this.apiKey =
      options.apiKey ??
      process.env.OPENAI_API_KEY;
    this.model =
      options.model ??
      process.env.MEDIA_VISION_MODEL ??
      DEFAULT_MEDIA_VISION_MODEL;
    this.requestTimeoutMs =
      options.requestTimeoutMs ??
      DEFAULT_VISION_TIMEOUT_MS;
  }

  async analyze(
    request: ImageUnderstandingRequest,
  ): Promise<ImageUnderstandingResult> {
    const controller =
      new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );
    let response: unknown;

    try {
      response =
        await this.resolveClient()
          .responses.create({
            model: this.model,
            instructions: INSTRUCTIONS,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: "Extract safe conversation context from this image.",
                  },
                  {
                    type: "input_image",
                    image_url:
                      `data:${request.contentType};base64,${Buffer.from(request.bytes).toString("base64")}`,
                    detail: "high",
                  },
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name:
                  "image_understanding",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "category",
                    "sensitivity",
                    "safeContextText",
                    "detectedLanguage",
                    "requiresHumanReview",
                  ],
                  properties: {
                    category: {
                      type: "string",
                      enum: [...CATEGORIES],
                    },
                    sensitivity: {
                      type: "string",
                      enum: [...SENSITIVITIES],
                    },
                    safeContextText: {
                      type: "string",
                    },
                    detectedLanguage: {
                      type: ["string", "null"],
                    },
                    requiresHumanReview: {
                      type: "boolean",
                    },
                  },
                },
              },
            },
            store: false,
          }, {
            signal: controller.signal,
          });
    } finally {
      clearTimeout(timeout);
    }

    const value = this.parseResponse(response);

    return {
      ...value,
      provider: this.name,
      model: this.model,
    };
  }

  private parseResponse(
    response: unknown,
  ): Omit<
    ImageUnderstandingResult,
    "provider" | "model"
  > {
    const outputText =
      typeof response === "object" &&
      response !== null &&
      "output_text" in response &&
      typeof response.output_text ===
        "string"
        ? response.output_text
        : "";
    const parsed = JSON.parse(
      outputText,
    ) as Record<string, unknown>;

    if (
      !CATEGORIES.has(
        parsed.category as MediaCategory,
      ) ||
      !SENSITIVITIES.has(
        parsed.sensitivity as MediaSensitivity,
      ) ||
      typeof parsed.safeContextText !==
        "string" ||
      typeof parsed.requiresHumanReview !==
        "boolean"
    ) {
      throw new Error(
        "OpenAI image analysis returned invalid structured output",
      );
    }

    return {
      category:
        parsed.category as MediaCategory,
      sensitivity:
        parsed.sensitivity as MediaSensitivity,
      safeContextText:
        parsed.safeContextText,
      detectedLanguage:
        typeof parsed.detectedLanguage ===
          "string"
          ? parsed.detectedLanguage
          : undefined,
      requiresHumanReview:
        parsed.requiresHumanReview,
    };
  }

  private resolveClient(): OpenAIImageUnderstandingClient {
    if (this.client) {
      return this.client;
    }

    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for image understanding",
      );
    }

    return new OpenAI({
      apiKey: this.apiKey,
    }) as unknown as OpenAIImageUnderstandingClient;
  }
}
