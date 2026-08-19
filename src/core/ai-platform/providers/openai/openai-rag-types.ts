export type OpenAIKnowledgeTargetAudience =
  | "public"
  | "internal";

export interface OpenAIVectorStoreTarget {
  audience: OpenAIKnowledgeTargetAudience;
  environment:
    | "development"
    | "production";
}

export interface OpenAIVectorStoreConfig {
  audience: OpenAIKnowledgeTargetAudience;
  environment:
    | "development"
    | "production";
  vectorStoreId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpenAIVectorStoreConfigRepository {
  getVectorStoreConfig(
    target: OpenAIVectorStoreTarget,
  ): Promise<OpenAIVectorStoreConfig | null>;

  saveVectorStoreConfig(
    config: OpenAIVectorStoreConfig,
  ): Promise<void>;
}

export interface OpenAIRetrievalDiagnosticResult {
  query?: string;
  fileId?: string;
  filename?: string;
  score?: number;
  snippet?: string;
}

export interface OpenAIRetrievalDiagnostics {
  queries: string[];
  results: OpenAIRetrievalDiagnosticResult[];
}
