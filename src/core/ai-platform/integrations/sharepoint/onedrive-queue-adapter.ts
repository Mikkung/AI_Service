import {
  readdir,
  readFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type {
  ApprovedKnowledgePublicationResult,
  PublishApprovedKnowledge,
} from "@/core/ai-platform/integrations/sharepoint/approved-knowledge-publication";

const sidecarSchema = z.object({
  sourceSystem: z
    .literal("sharepoint"),
  sourceItemId: z
    .string()
    .trim()
    .min(1),
  sourceVersion: z
    .string()
    .trim()
    .min(1)
    .optional(),
  fileName: z
    .string()
    .trim()
    .min(1),
  audience: z.enum([
    "public",
    "internal",
  ]),
  knowledgeCategory: z
    .string()
    .trim()
    .min(1)
    .optional(),
  knowledgeOwner: z
    .string()
    .trim()
    .min(1)
    .optional(),
  knowledgeVersion: z
    .string()
    .trim()
    .min(1)
    .optional(),
  effectiveFrom: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),
  effectiveTo: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),
  approvalStatus: z
    .string()
    .trim()
    .min(1),
  sourceModifiedAt: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),
});

export interface OneDriveQueueItemResult {
  manifestPath: string;
  contentPath?: string;
  ok: boolean;
  result?: ApprovedKnowledgePublicationResult;
  error?: string;
}

export class OneDriveQueueAdapter {
  constructor(
    private readonly useCase: Pick<
      PublishApprovedKnowledge,
      "execute"
    >,
  ) {}

  async processQueue(
    queuePath: string,
  ): Promise<OneDriveQueueItemResult[]> {
    const entries =
      await readdir(queuePath, {
        withFileTypes: true,
      });

    const manifests =
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(
              ".publish.json",
            ),
        )
        .map((entry) =>
          path.join(
            queuePath,
            entry.name,
          ),
        )
        .sort();

    const results: OneDriveQueueItemResult[] =
      [];

    for (const manifestPath of manifests) {
      results.push(
        await this.processManifest(
          manifestPath,
        ),
      );
    }

    return results;
  }

  private async processManifest(
    manifestPath: string,
  ): Promise<OneDriveQueueItemResult> {
    const contentPath =
      manifestPath.replace(
        /\.publish\.json$/u,
        "",
      );

    try {
      const manifestRaw =
        await readFile(
          manifestPath,
          "utf8",
        );
      const parsedJson =
        JSON.parse(
          manifestRaw,
        ) as unknown;
      const parsed =
        sidecarSchema.safeParse(
          parsedJson,
        );

      if (!parsed.success) {
        return {
          manifestPath,
          contentPath,
          ok: false,
          error:
            "Malformed publish sidecar",
        };
      }

      const content =
        await readFile(contentPath);
      const result =
        await this.useCase.execute({
          ...parsed.data,
          content,
        });

      return {
        manifestPath,
        contentPath,
        ok: true,
        result,
      };
    } catch (error) {
      return {
        manifestPath,
        contentPath,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown queue item error",
      };
    }
  }
}
