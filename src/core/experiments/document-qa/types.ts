export interface DocumentQAInput {
  question: string;
  sourceText: string;
}

export interface DocumentQAEvidence {
  text: string;
}

export interface DocumentQAUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface DocumentQAOutput {
  answerable: boolean;
  answer: string;
  evidence: DocumentQAEvidence[];
  provider: string;
  model: string;
  finishReason?: string;
  usage?: DocumentQAUsage;
}

export interface DocumentQAProvider {
  name: string;
  answer(input: DocumentQAInput): Promise<DocumentQAOutput>;
}

export interface LoadedDocumentQASource {
  sourceText: string;
  sourceChunkCount: number;
  sourceCharacterCount: number;
}
