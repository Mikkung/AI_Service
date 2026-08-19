import type {
  GroundedQAProvider,
  GroundedQARequest,
  GroundedQAResult,
} from "@/core/ai-platform/types/grounded-answer";

export type MockGroundedQAScenario =
  | "grounded"
  | "unsupported"
  | "missing_citation";

export interface MockGroundedQAProviderOptions {
  scenario?: MockGroundedQAScenario;
}

export class MockGroundedQAProvider
  implements GroundedQAProvider
{
  readonly name = "mock";

  private readonly scenario: MockGroundedQAScenario;

  constructor(
    options: MockGroundedQAProviderOptions = {},
  ) {
    this.scenario =
      options.scenario ?? "grounded";
  }

  async answer(
    request: GroundedQARequest,
  ): Promise<GroundedQAResult> {
    const startedAt =
      Date.now();

    if (this.scenario === "unsupported") {
      return {
        answerable: false,
        answer: "",
        citations: [],
        provider: this.name,
        model: "mock-static",
        latencyMs:
          Date.now() - startedAt,
        providerMetadata: {
          scenario:
            this.scenario,
          audience:
            request.audience,
        },
      };
    }

    if (
      this.scenario ===
      "missing_citation"
    ) {
      return {
        answerable: true,
        answer:
          "Unsupported grounded claim",
        citations: [],
        provider: this.name,
        model: "mock-static",
        latencyMs:
          Date.now() - startedAt,
        providerMetadata: {
          scenario:
            this.scenario,
          audience:
            request.audience,
        },
      };
    }

    return {
      answerable: true,
      answer:
        "Mock grounded answer",
      citations: [
        {
          documentId:
            "mock-doc-1",
          title:
            "Mock Approved Document",
        },
      ],
      evidence: [
        {
          citation: {
            documentId:
              "mock-doc-1",
            title:
              "Mock Approved Document",
          },
          text:
            "Mock source evidence",
        },
      ],
      provider: this.name,
      model: "mock-static",
      latencyMs:
        Date.now() - startedAt,
      providerMetadata: {
        scenario:
          this.scenario,
        audience:
          request.audience,
      },
    };
  }
}
