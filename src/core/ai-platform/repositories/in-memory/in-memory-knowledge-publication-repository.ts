import type {
  CreateKnowledgePublicationInput,
  KnowledgePublicationRepository,
  ListKnowledgePublicationsFilter,
  UpdateKnowledgePublicationInput,
} from "@/core/ai-platform/repositories/knowledge-publication-repository";

import type {
  KnowledgePublication,
} from "@/core/ai-platform/types/knowledge-publication";

function clonePublication(
  publication: KnowledgePublication,
): KnowledgePublication {
  return {
    ...publication,
    providerMetadata:
      publication.providerMetadata
        ? {
            ...publication.providerMetadata,
          }
        : undefined,
  };
}

export class InMemoryKnowledgePublicationRepository
  implements KnowledgePublicationRepository
{
  private readonly publications =
    new Map<string, KnowledgePublication>();

  async createPublication(
    input: CreateKnowledgePublicationInput,
  ): Promise<KnowledgePublication> {
    if (
      this.publications.has(input.id)
    ) {
      throw new Error(
        `Knowledge publication already exists: ${input.id}`,
      );
    }

    const publication: KnowledgePublication = {
      ...input,
    };

    this.publications.set(
      publication.id,
      clonePublication(publication),
    );

    return clonePublication(publication);
  }

  async getPublication(
    id: string,
  ): Promise<KnowledgePublication | null> {
    const publication =
      this.publications.get(id);

    return publication
      ? clonePublication(publication)
      : null;
  }

  async findLatestPublication(
    documentId: string,
    targetProvider: string,
    targetEnvironment = "development",
  ): Promise<KnowledgePublication | null> {
    const publication = [
      ...this.publications.values(),
    ]
      .filter(
        (item) =>
          item.documentId ===
            documentId &&
          item.targetProvider ===
            targetProvider &&
          item.targetEnvironment ===
            targetEnvironment,
      )
      .sort((left, right) =>
        (right.publishedAt ?? "")
          .localeCompare(
            left.publishedAt ?? "",
          ) ||
        right.id.localeCompare(left.id),
      )[0];

    return publication
      ? clonePublication(publication)
      : null;
  }

  async updatePublication(
    input: UpdateKnowledgePublicationInput,
  ): Promise<KnowledgePublication> {
    const existing =
      this.publications.get(input.id);

    if (!existing) {
      throw new Error(
        `Knowledge publication not found: ${input.id}`,
      );
    }

    const updated: KnowledgePublication = {
      ...existing,
      ...input,
    };

    this.publications.set(
      input.id,
      clonePublication(updated),
    );

    return clonePublication(updated);
  }

  async listPublications(
    filters: ListKnowledgePublicationsFilter = {},
  ): Promise<KnowledgePublication[]> {
    return [
      ...this.publications.values(),
    ]
      .filter(
        (publication) =>
          (!filters.documentId ||
            publication.documentId ===
              filters.documentId) &&
          (!filters.targetProvider ||
            publication.targetProvider ===
              filters.targetProvider) &&
          (!filters.targetEnvironment ||
            publication.targetEnvironment ===
              filters.targetEnvironment) &&
          (!filters.publicationStatus ||
            publication.publicationStatus ===
              filters.publicationStatus),
      )
      .sort((left, right) =>
        (left.publishedAt ?? "")
          .localeCompare(
            right.publishedAt ?? "",
          ) ||
        left.id.localeCompare(right.id),
      )
      .map(clonePublication);
  }
}
