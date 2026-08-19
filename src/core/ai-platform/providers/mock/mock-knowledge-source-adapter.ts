import type {
  KnowledgeSourceAdapter,
  SourceDocumentDescriptor,
  SourceDocumentPayload,
} from "@/core/ai-platform/knowledge/knowledge-source-adapter";

import type {
  KnowledgeSourceSystem,
} from "@/core/ai-platform/types/knowledge";

interface MockSourceDocument {
  descriptor: SourceDocumentDescriptor;
  text: string;
}

export class MockKnowledgeSourceAdapter
  implements KnowledgeSourceAdapter
{
  readonly sourceSystem: KnowledgeSourceSystem =
    "sharepoint";

  private readonly documents =
    new Map<string, MockSourceDocument>();

  constructor(
    documents: MockSourceDocument[] = [],
  ) {
    for (const document of documents) {
      this.documents.set(
        document.descriptor.sourceReference,
        document,
      );
    }
  }

  upsertTextDocument(
    document: MockSourceDocument,
  ): void {
    this.documents.set(
      document.descriptor.sourceReference,
      document,
    );
  }

  async listChangedDocuments(
    since?: string,
  ): Promise<SourceDocumentDescriptor[]> {
    const sinceTime =
      since ? Date.parse(since) : null;

    return [
      ...this.documents.values(),
    ]
      .filter((document) => {
        if (sinceTime === null) {
          return true;
        }

        if (!document.descriptor.modifiedAt) {
          return true;
        }

        return (
          Date.parse(
            document.descriptor.modifiedAt,
          ) > sinceTime
        );
      })
      .map((document) => ({
        ...document.descriptor,
        metadata:
          document.descriptor.metadata
            ? {
                ...document.descriptor.metadata,
              }
            : undefined,
      }))
      .sort((left, right) =>
        left.sourceReference.localeCompare(
          right.sourceReference,
        ),
      );
  }

  async fetchDocument(
    sourceReference: string,
  ): Promise<SourceDocumentPayload> {
    const document =
      this.documents.get(sourceReference);

    if (!document) {
      throw new Error(
        `Source document not found: ${sourceReference}`,
      );
    }

    return {
      descriptor: {
        ...document.descriptor,
        metadata:
          document.descriptor.metadata
            ? {
                ...document.descriptor.metadata,
              }
            : undefined,
      },
      content: {
        type: "text",
        text: document.text,
      },
    };
  }
}
