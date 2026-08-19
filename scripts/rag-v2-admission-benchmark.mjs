import {
  writeFile,
} from "node:fs/promises";

const DEFAULT_BASE_URL =
  "http://localhost:3000";

const SMOKE_CASES = [
  {
    id: "S01",
    question:
      "Option 1 CU-ATS ขั้นต่ำเท่าไหร่",
    humanReview: false,
    evaluate: ({ answer, answerable, safeToSend, citationCount }) =>
      answerable === true &&
      safeToSend === true &&
      citationCount >= 1 &&
      /800/.test(answer),
  },
  {
    id: "S02",
    question:
      "CU-ENT ต้องได้ขั้นต่ำเท่าไหร่สำหรับ Option 3",
    humanReview: false,
    evaluate: ({ answer, answerable, safeToSend, citationCount }) =>
      answerable === true &&
      safeToSend === true &&
      citationCount >= 1 &&
      /ไม่ได้ระบุ|ไม่มีการระบุ|no minimum/i.test(answer),
  },
  {
    id: "S03",
    question:
      "TGAT และ TPAT3 ต้องได้ขั้นต่ำเท่าไหร่",
    humanReview: false,
    evaluate: ({ answer, answerable, safeToSend, citationCount }) =>
      answerable === true &&
      safeToSend === true &&
      citationCount >= 1 &&
      /TGAT/i.test(answer) &&
      /TPAT3/i.test(answer) &&
      /ไม่ได้ระบุ|ไม่มีการระบุ|no minimum/i.test(answer),
  },
  {
    id: "S04",
    question:
      "Option 1 สามารถส่งคะแนนคณิตศาสตร์มากกว่า 1 รายการได้ไหม",
    humanReview: true,
    evaluate: ({ answer, answerable, safeToSend, citationCount }) =>
      answerable === true &&
      safeToSend === true &&
      citationCount >= 1 &&
      /อย่างน้อยหนึ่ง|one or more|มากกว่าหนึ่ง/i.test(answer) &&
      !/ไม่มีข้อจำกัดจำนวนรายการ|unlimited|ตามความเหมาะสม/i.test(answer),
  },
  {
    id: "S05",
    question:
      "ค่าเทอม AY2027 เท่าไหร่",
    humanReview: false,
    evaluate: ({ answer, answerable, groundingReason, citationCount }) =>
      answerable === false &&
      groundingReason ===
        "unsupported" &&
      citationCount === 0 &&
      !/\d{2,}/.test(answer),
  },
];

const ADMISSION_CASES = [
  ["A01", "Option1-English", "Option 1 IELTS ขั้นต่ำเท่าไหร่", "IELTS = 6.0"],
  ["A02", "Option1-English", "Option 1 TOEFL iBT ขั้นต่ำเท่าไหร่", "TOEFL iBT = 80"],
  ["A03", "Option1-English", "Option 1 CU-TEP ขั้นต่ำเท่าไหร่", "CU-TEP = 80"],
  ["A04", "Option1-English", "Option 1 Duolingo ขั้นต่ำเท่าไหร่", "Duolingo = 105"],
  ["A05", "Option1-Math", "Option 1 SAT Mathematics ขั้นต่ำเท่าไหร่", "SAT Mathematics = 620"],
  ["A06", "Option1-Math", "Option 1 CU-AAT Mathematics ขั้นต่ำเท่าไหร่", "CU-AAT Mathematics = 480"],
  ["A07", "Option1-Math", "Option 1 ACT Mathematics ขั้นต่ำเท่าไหร่", "ACT Mathematics = 26"],
  ["A08", "Option1-Math", "Option 1 AP Calculus AB หรือ BC ขั้นต่ำเท่าไหร่", "AP Calculus AB/BC = 4"],
  ["A09", "Option1-Science", "Option 1 CU-ATS ขั้นต่ำเท่าไหร่", "CU-ATS = 800"],
  ["A10", "Option1-Science", "Option 1 ACT Sciences ขั้นต่ำเท่าไหร่", "ACT Sciences = 25"],
  ["A11", "Option1-Science", "Option 1 AP Chemistry และ AP Physics ใช้เกณฑ์อะไร", "AP Chemistry and AP Physics, minimum 4 each per canonical criteria"],
  ["A12", "Option1-Logic", "Option 1 interview คิด 15% ใช่ไหม", "No. Interview = Pass/Fail, no percentage weight"],
  ["A13", "Option1-Logic", "Option 1 สามารถส่งคะแนนคณิตศาสตร์มากกว่า 1 รายการได้ไหม", "At least one means one or more; do not invent score-selection rule"],
  ["A14", "Option1-Logic", "Option 1 ต้องผ่าน SAT, ACT และ CU-AAT ทุกตัวหรือไม่", "No. At least one qualifying Math result; categories are AND, tests within category are alternatives"],
  ["A15", "Option1-Rounds", "Option 1 ใช้สมัครรอบไหนได้บ้าง", "Round 1 and Round 2, same criteria"],
  ["A16", "Option2", "Option 2 GPAX ขั้นต่ำเท่าไหร่", "Overall, Science, Math GPAX >= 3.25; GPAX weight 30%"],
  ["A17", "Option2", "Option 2 Portfolio และ Interview มีน้ำหนักกี่เปอร์เซ็นต์", "Portfolio 35%, Interview 15%"],
  ["A18", "Option3", "Option 3 GPAX และ CU-ENT มีน้ำหนักเท่าไหร่", "GPAX total 25.5% (8.5% each); CU-ENT 51%"],
  ["A19", "Option3", "CU-ENT ต้องได้ขั้นต่ำเท่าไหร่สำหรับ Option 3", "No minimum CU-ENT score currently specified"],
  ["A20", "Option4", "Option 4 ใช้อะไรบ้างและแต่ละส่วนมีน้ำหนักเท่าไหร่", "GPAX 25.5%, English 8.5%, TGAT 17%, TPAT3 34%, Interview 15%"],
  ["A21", "Option4", "TGAT และ TPAT3 มีคะแนนขั้นต่ำหรือยัง", "No minimum TGAT/TPAT3 currently specified"],
  ["A22", "Equivalency", "ถ้าเรียนมัธยมเป็นภาษาอังกฤษ ต้องใช้ IELTS อีกไหม", "English-medium secondary education evidence may satisfy English minimum; do not invent extra conditions"],
  ["A23", "Routing", "สรุป IELTS requirement", "Specific IELTS summary"],
  ["A24", "Routing", "ขอรายละเอียดเกณฑ์การรับสมัคร AY2027 ทั้งหมด", "Complete Option 1-4 and AY2027 details"],
  ["A25", "Unsupported", "ค่าเทอม AY2027 เท่าไหร่", "If tuition is not in retrieved knowledge, state KB lacks answer / staff confirmation required; do not guess"],
].map(([id, category, question, expected]) => ({
  id,
  category,
  question,
  expected,
  humanReview: true,
  evaluate: ({ answerable, safeToSend, groundingReason }) =>
    question.includes("ค่าเทอม")
      ? answerable === false &&
        groundingReason ===
          "unsupported"
      : answerable === true &&
        safeToSend === true,
}));

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

function percentile(values, p) {
  if (values.length === 0) {
    return undefined;
  }

  const sorted =
    values.slice().sort((a, b) => a - b);
  const index =
    Math.ceil(
      (p / 100) * sorted.length,
    ) - 1;

  return sorted[
    Math.max(
      0,
      Math.min(index, sorted.length - 1),
    )
  ];
}

function average(values) {
  if (values.length === 0) {
    return undefined;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length
  );
}

async function runCase({
  baseUrl,
  apiKey,
  testCase,
}) {
  const startedAt =
    Date.now();

  try {
    const response =
      await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/admin/experiments/rag-v2/chat`,
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
          }),
        },
      );

    const body =
      await response.json();
    const citations =
      Array.isArray(body.citations)
        ? body.citations
        : [];
    const retrievalResults =
      Array.isArray(
        body.retrieval?.results,
      )
        ? body.retrieval.results
        : [];

    const record = {
      id: testCase.id,
      category:
        testCase.category,
      question:
        testCase.question,
      expected:
        testCase.expected,
      answer:
        body.answer ?? "",
      answerable:
        body.answerable,
      safeToSend:
        body.safeToSend,
      groundingReason:
        body.groundingReason,
      citationCount:
        citations.length,
      citationFiles:
        citations
          .map(
            (citation) =>
              citation.filename ??
              citation.externalFileId ??
              citation.documentId,
          )
          .filter(Boolean)
          .join(" | "),
      retrievalTopScore:
        retrievalResults[0]?.score,
      latencyMs:
        body.latencyMs ??
        Date.now() - startedAt,
      inputTokens:
        body.usage?.inputTokens,
      outputTokens:
        body.usage?.outputTokens,
      totalTokens:
        body.usage?.totalTokens,
      humanReview:
        Boolean(testCase.humanReview),
      error:
        response.ok &&
        body.ok === true
          ? ""
          : body.error ??
            `HTTP ${response.status}`,
    };

    const automatedPass =
      response.ok &&
      body.ok === true &&
      testCase.evaluate(record);

    return {
      ...record,
      automatedPass,
      failureReason:
        automatedPass
          ? ""
          : record.error ||
            "Automated expectation failed",
    };
  } catch (error) {
    return {
      id: testCase.id,
      category:
        testCase.category,
      question:
        testCase.question,
      expected:
        testCase.expected,
      answer: "",
      answerable:
        undefined,
      safeToSend:
        undefined,
      groundingReason:
        undefined,
      citationCount: 0,
      citationFiles: "",
      retrievalTopScore:
        undefined,
      latencyMs:
        Date.now() - startedAt,
      inputTokens:
        undefined,
      outputTokens:
        undefined,
      totalTokens:
        undefined,
      automatedPass: false,
      humanReview:
        Boolean(testCase.humanReview),
      failureReason:
        "Request failed",
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

function summarizeCosts(results, args) {
  const inputTokens =
    results.reduce(
      (sum, result) =>
        sum +
        Number(result.inputTokens ?? 0),
      0,
    );
  const outputTokens =
    results.reduce(
      (sum, result) =>
        sum +
        Number(result.outputTokens ?? 0),
      0,
    );
  const totalTokens =
    results.reduce(
      (sum, result) =>
        sum +
        Number(result.totalTokens ?? 0),
      0,
    );
  const latencies =
    results
      .map((result) =>
        Number(result.latencyMs),
      )
      .filter(Number.isFinite);
  const inputPrice =
    Number(args["input-price-per-1m"]);
  const outputPrice =
    Number(args["output-price-per-1m"]);
  const estimatedCostUsd =
    Number.isFinite(inputPrice) &&
    Number.isFinite(outputPrice)
      ? (inputTokens / 1_000_000) *
          inputPrice +
        (outputTokens / 1_000_000) *
          outputPrice
      : undefined;

  return {
    tokenTotals: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
    latencyMs: {
      average:
        average(latencies),
      median:
        percentile(latencies, 50),
      p95:
        percentile(latencies, 95),
    },
    estimatedCostUsd,
  };
}

async function main() {
  const args =
    parseArgs(process.argv);
  const baseUrl =
    args["base-url"] ??
    DEFAULT_BASE_URL;
  const apiKey =
    requireArg(
      args["api-key"] ??
        process.env.APP_API_KEY,
      "api-key",
    );
  const outputPrefix =
    args.output ??
    `rag-v2-admission-benchmark-${Date.now()}`;
  const cases =
    args.smoke === "true"
      ? SMOKE_CASES
      : ADMISSION_CASES;

  const results = [];

  for (const testCase of cases) {
    console.log(
      `[${testCase.id}] ${testCase.question}`,
    );

    results.push(
      await runCase({
        baseUrl,
        apiKey,
        testCase,
      }),
    );
  }

  const summary = {
    generatedAt:
      new Date().toISOString(),
    baseUrl,
    suite:
      args.smoke === "true"
        ? "smoke"
        : "admission-a01-a25",
    passed:
      results.filter(
        (item) =>
          item.automatedPass,
      ).length,
    total:
      results.length,
    observability:
      summarizeCosts(results, args),
    results,
  };

  await writeFile(
    `${outputPrefix}.json`,
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  const headers = [
    "id",
    "question",
    "answer",
    "answerable",
    "safeToSend",
    "groundingReason",
    "citationCount",
    "citationFiles",
    "retrievalTopScore",
    "latencyMs",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "automatedPass",
    "humanReview",
    "failureReason",
    "error",
  ];

  const csvRows = [
    headers.map(csvEscape).join(","),
    ...results.map((item) =>
      headers
        .map((header) =>
          csvEscape(item[header]),
        )
        .join(","),
    ),
  ];

  await writeFile(
    `${outputPrefix}.csv`,
    `\ufeff${csvRows.join("\n")}\n`,
    "utf8",
  );

  console.log(
    `RAG v2 admission benchmark: ${summary.passed}/${summary.total} automated checks passed`,
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
