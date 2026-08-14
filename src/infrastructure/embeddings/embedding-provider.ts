export interface EmbeddingResult {
  embedding: number[];
  provider: string;
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider {
  readonly name: string;

  embedDocument(input: {
    text: string;
    title?: string;
  }): Promise<EmbeddingResult>;

  embedQuery(input: {
    text: string;
  }): Promise<EmbeddingResult>;
}