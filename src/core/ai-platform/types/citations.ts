export interface Citation {
  documentId?: string;
  externalFileId?: string;
  title?: string;
  filename?: string;
  page?: number;
  snippet?: string;
  providerMetadata?: Record<string, unknown>;
}

export interface RetrievalEvidence {
  citation: Citation;
  score?: number;
  text?: string;
}
