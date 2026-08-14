import { createHash } from "node:crypto";

import { parse } from "csv-parse/sync";
import { z } from "zod";

import type {
  HistoricalQaChannel,
  HistoricalQaWriteInput,
} from "@/core/admin-ai/types";

import {
  FirestoreAdminAiRepository,
} from "@/infrastructure/repositories/firestore-admin-ai-repository";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_ROWS = 20_000;

const rowSchema = z.object({
  qa_candidate_id: z.string().optional().default(""),
  channel: z.string().optional().default(""),
  conversation_id: z.string().optional().default(""),
  question_at: z.string().optional().default(""),
  answer_at: z.string().optional().default(""),
  question: z.string().trim().min(1),
  historical_answer: z.string().trim().min(1),
  context_before: z.string().optional().default(""),
  topic: z.string().optional().default(""),
  language: z.string().optional().default(""),
  historical_reference_year: z.string().optional().default(""),
  time_sensitive: z.string().optional().default(""),
  answer_stability: z.string().optional().default(""),
  reusability: z.string().optional().default(""),
  candidate_confidence: z.string().optional().default(""),
  review_priority: z.string().optional().default(""),
  knowledge_audience: z.string().optional().default("public"),
  source_trace_id: z.string().optional().default(""),
});

const allowedChannels = new Set<HistoricalQaChannel>([
  "facebook",
  "facebook_messenger",
  "line",
  "web",
  "teams",
  "manual",
  "other",
]);

function normalizeChannel(value: string): HistoricalQaChannel {
  const normalized = value.trim().toLowerCase();
  return allowedChannels.has(normalized as HistoricalQaChannel)
    ? (normalized as HistoricalQaChannel)
    : "other";
}

function parseBoolean(value: string): boolean {
  return ["true", "yes", "1", "y"].includes(
    value.trim().toLowerCase(),
  );
}

function createHistoryId(input: {
  channel: HistoricalQaChannel;
  sourceTraceId?: string;
  qaCandidateId?: string;
  conversationId?: string;
  questionAt?: string;
  answerAt?: string;
  question: string;
  historicalAnswer: string;
}): string {
  const stableSourceKey =
    input.sourceTraceId ||
    input.qaCandidateId ||
    [
      input.conversationId,
      input.questionAt,
      input.answerAt,
      input.question,
      input.historicalAnswer,
    ].join("|");

  const hash = createHash("sha256")
    .update(`${input.channel}|${stableSourceKey}`)
    .digest("hex")
    .slice(0, 32);

  return `qa_${hash}`;
}

export async function POST(request: Request) {
  if (!hasValidApiKey(request)) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let importBatchId: string | undefined;
  const repository = new FirestoreAdminAiRepository();

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const channelOverride = String(
      formData.get("channel") ?? "",
    ).trim();
    const importedBy = String(
      formData.get("importedBy") ?? "",
    ).trim();
    const piiRedacted = parseBoolean(
      String(formData.get("piiRedacted") ?? "true"),
    );

    if (!(file instanceof File)) {
      return Response.json(
        { ok: false, error: "CSV file is required." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return Response.json(
        { ok: false, error: "Only .csv files are supported." },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return Response.json(
        {
          ok: false,
          error: "CSV must be between 1 byte and 15 MB.",
        },
        { status: 400 },
      );
    }

    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    const rawRows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: false,
    }) as Record<string, unknown>[];

    if (rawRows.length === 0) {
      return Response.json(
        { ok: false, error: "CSV contains no data rows." },
        { status: 400 },
      );
    }

    if (rawRows.length > MAX_ROWS) {
      return Response.json(
        {
          ok: false,
          error: `CSV exceeds the ${MAX_ROWS} row import limit.`,
        },
        { status: 400 },
      );
    }

    const rows: HistoricalQaWriteInput[] = [];
    const invalidRows: Array<{ row: number; error: string }> = [];

    for (let index = 0; index < rawRows.length; index += 1) {
      const parsed = rowSchema.safeParse(rawRows[index]);

      if (!parsed.success) {
        invalidRows.push({
          row: index + 2,
          error: "Missing or invalid question/historical_answer.",
        });
        continue;
      }

      const data = parsed.data;
      const channel = normalizeChannel(
        channelOverride || data.channel,
      );
      const audience =
        data.knowledge_audience.trim().toLowerCase() === "internal"
          ? "internal"
          : "public";

      const id = createHistoryId({
        channel,
        sourceTraceId: data.source_trace_id,
        qaCandidateId: data.qa_candidate_id,
        conversationId: data.conversation_id,
        questionAt: data.question_at,
        answerAt: data.answer_at,
        question: data.question,
        historicalAnswer: data.historical_answer,
      });

      rows.push({
        id,
        importBatchId: "pending",
        qaCandidateId: data.qa_candidate_id || undefined,
        channel,
        conversationId: data.conversation_id || undefined,
        questionAt: data.question_at || undefined,
        answerAt: data.answer_at || undefined,
        question: data.question,
        historicalAnswer: data.historical_answer,
        contextBefore: data.context_before || undefined,
        topic: data.topic || undefined,
        language: data.language || undefined,
        historicalReferenceYear:
          data.historical_reference_year || undefined,
        timeSensitive: parseBoolean(data.time_sensitive),
        answerStability: data.answer_stability || undefined,
        reusability: data.reusability || undefined,
        candidateConfidence: data.candidate_confidence || undefined,
        reviewPriority: data.review_priority || undefined,
        knowledgeAudience: audience,
        sourceTraceId: data.source_trace_id || undefined,
        reviewStatus: "pending",
        approvedForKnowledge: false,
        containsPii: false,
        piiRedacted,
      });
    }

    if (rows.length === 0) {
      return Response.json(
        {
          ok: false,
          error: "No valid Q&A rows were found.",
          invalidRows: invalidRows.slice(0, 20),
        },
        { status: 400 },
      );
    }

    const batchChannel = normalizeChannel(
      channelOverride || rows[0].channel,
    );

    importBatchId = await repository.createImportBatch({
      channel: batchChannel,
      sourceFile: file.name,
      importedBy: importedBy || undefined,
    });

    const preparedRows = rows.map((row) => ({
      ...row,
      importBatchId: importBatchId!,
    }));

    const result = await repository.importHistoricalQa(
      importBatchId,
      preparedRows,
    );

    await repository.completeImportBatch(result);

    return Response.json({
      ok: true,
      ...result,
      invalidRows: invalidRows.length,
      invalidRowExamples: invalidRows.slice(0, 20),
      sourceFile: file.name,
      channel: batchChannel,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import error";

    console.error("Historical Q&A import failed", error);

    if (importBatchId) {
      await repository.failImportBatch({
        importBatchId,
        errorMessage: message,
      });
    }

    return Response.json(
      {
        ok: false,
        error: "Historical Q&A import failed.",
        details:
          process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
