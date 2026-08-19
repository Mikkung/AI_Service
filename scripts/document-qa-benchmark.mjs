import {
  writeFile,
} from "node:fs/promises";

const DEFAULT_BASE_URL =
  "http://localhost:3000";

const CASES = [
  {
    id: "B01",
    question:
      "ค่าสมัครสอบหรือค่าสมัครโครงการเท่าไหร่",
    evaluate(response) {
      return (
        response.answerable === true &&
        response.evidenceVerified === true &&
        /800/.test(response.answer)
      );
    },
  },
  {
    id: "B02",
    question:
      "สรุป IELTS requirement",
    humanReview: true,
    evaluate(response) {
      return (
        response.answerable === true &&
        response.evidenceVerified === true
      );
    },
  },
  {
    id: "B03",
    question:
      "CU-ENT ต้องได้ขั้นต่ำเท่าไหร่สำหรับ Option 3",
    evaluate(response) {
      const answer =
        String(response.answer ?? "");

      return (
        response.answerable === true &&
        response.evidenceVerified === true &&
        /ไม่มีการระบุ|ไม่ได้ระบุ|no minimum/i.test(answer) &&
        !/(ขั้นต่ำ\s*(คือ|=)?\s*0|min(?:imum)?\s*(is|=)?\s*0)/i.test(answer)
      );
    },
  },
  {
    id: "B04",
    question:
      "TGAT และ TPAT3 ต้องได้ขั้นต่ำเท่าไหร่",
    evaluate(response) {
      const answer =
        String(response.answer ?? "");

      return (
        response.answerable === true &&
        response.evidenceVerified === true &&
        /TGAT/i.test(answer) &&
        /TPAT3/i.test(answer) &&
        /ไม่มีการระบุ|ไม่ได้ระบุ|no minimum/i.test(answer) &&
        !/(ขั้นต่ำ\s*(คือ|=)?\s*0|min(?:imum)?\s*(is|=)?\s*0)/i.test(answer)
      );
    },
  },
  {
    id: "B05",
    question:
      "ค่าเทอม AY2027 เท่าไหร่",
    evaluate(response) {
      return (
        response.answerable === false &&
        Array.isArray(response.evidence) &&
        response.evidence.length === 0 &&
        response.evidenceVerified === true
      );
    },
  },
];

function parseArgs(argv) {
  const result = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current =
      argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key =
      current.slice(2);

    const next =
      argv[index + 1];

    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function requireArg(value, name) {
  if (!value) {
    throw new Error(
      `Missing required argument: --${name}`,
    );
  }

  return value;
}

function csvEscape(value) {
  const text =
    value === undefined || value === null
      ? ""
      : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

async function runCase({
  baseUrl,
  apiKey,
  provider,
  sourceId,
  testCase,
}) {
  const response =
    await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/admin/experiments/document-qa`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "x-api-key":
            apiKey,
        },
        body: JSON.stringify({
          question:
            testCase.question,
          sourceId,
          provider,
        }),
      },
    );

  const body =
    await response.json();

  const passed =
    response.ok &&
    body.ok === true &&
    testCase.evaluate(body);

  return {
    id: testCase.id,
    question:
      testCase.question,
    pass:
      passed,
    humanReview:
      Boolean(testCase.humanReview),
    status:
      response.status,
    provider:
      body.provider,
    model:
      body.model,
    answerable:
      body.answerable,
    evidenceVerified:
      body.evidenceVerified,
    answer:
      body.answer,
    evidenceCount:
      Array.isArray(body.evidence)
        ? body.evidence.length
        : undefined,
    latencyMs:
      body.latencyMs,
    finishReason:
      body.finishReason,
    usage:
      body.usage,
    error:
      body.error,
  };
}

async function main() {
  const args =
    parseArgs(process.argv);

  const baseUrl =
    args["base-url"] ??
    DEFAULT_BASE_URL;

  const apiKey =
    args["api-key"] ??
    process.env.APP_API_KEY;

  const provider =
    args.provider ??
    process.env.EXPERIMENT_DOCUMENT_QA_PROVIDER ??
    "gemini";

  const sourceId =
    requireArg(args.source, "source");

  const outputPrefix =
    args.output ??
    `document-qa-benchmark-${Date.now()}`;

  const results = [];

  for (const testCase of CASES) {
    results.push(
      await runCase({
        baseUrl,
        apiKey:
          requireArg(apiKey, "api-key"),
        provider,
        sourceId,
        testCase,
      }),
    );
  }

  const summary = {
    provider,
    sourceId,
    baseUrl,
    generatedAt:
      new Date().toISOString(),
    passed:
      results.filter((item) => item.pass)
        .length,
    total:
      results.length,
    results,
  };

  await writeFile(
    `${outputPrefix}.json`,
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  const csvRows = [
    [
      "id",
      "pass",
      "humanReview",
      "status",
      "answerable",
      "evidenceVerified",
      "evidenceCount",
      "latencyMs",
      "provider",
      "model",
      "finishReason",
      "question",
      "answer",
      "error",
    ].map(csvEscape).join(","),
    ...results.map((item) =>
      [
        item.id,
        item.pass,
        item.humanReview,
        item.status,
        item.answerable,
        item.evidenceVerified,
        item.evidenceCount,
        item.latencyMs,
        item.provider,
        item.model,
        item.finishReason,
        item.question,
        item.answer,
        item.error,
      ].map(csvEscape).join(","),
    ),
  ];

  await writeFile(
    `${outputPrefix}.csv`,
    `${csvRows.join("\n")}\n`,
    "utf8",
  );

  console.log(
    `Document QA benchmark: ${summary.passed}/${summary.total} passed`,
  );
  console.log(
    `Wrote ${outputPrefix}.json and ${outputPrefix}.csv`,
  );

  if (summary.passed !== summary.total) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );
  process.exitCode = 1;
});
