export type KnowledgeAudience =
  | "public"
  | "internal";

export type KnowledgeStatus =
  | "active"
  | "inactive";

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  title: string;
  text: string;

  audience: KnowledgeAudience;
  status: KnowledgeStatus;

  embedding: number[];
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
}

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  title: string;
  text: string;
  score: number;
}

export type RetrievalMode =
  | "semantic"
  | "source_expansion";

export interface RetrieveForAnswerOutput {
  mode: RetrievalMode;
  chunks: RetrievedChunk[];
  expandedSourceId?: string;
}
