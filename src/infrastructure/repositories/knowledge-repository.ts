import type {
  KnowledgeChunk,
} from "@/core/knowledge/types";

export interface SaveKnowledgeSourceInput {
  id: string;
  title: string;
  audience: "public" | "internal";
  status: "active" | "inactive";
  version: string;
}

export interface KnowledgeRepository {
  saveSource(
    input: SaveKnowledgeSourceInput,
  ): Promise<void>;

  saveChunk(
    chunk: KnowledgeChunk,
  ): Promise<void>;

  getActiveChunks(
    audience: "public" | "internal",
  ): Promise<KnowledgeChunk[]>;
}