import {
  writeFile,
} from "node:fs/promises";
import assert from "node:assert/strict";

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

function pass() {
  return {
    pass: true,
    reason: "",
  };
}

function fail(reason) {
  return {
    pass: false,
    reason,
  };
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) =>
    pattern.test(text),
  );
}

function hasAllTerms(text, terms) {
  return terms.every((term) =>
    typeof term === "string"
      ? text
          .toLowerCase()
          .includes(
            term.toLowerCase(),
          )
      : term.test(text),
  );
}

function hasNumber(text, numberPattern) {
  return new RegExp(
    `(^|[^0-9])${numberPattern}($|[^0-9])`,
    "i",
  ).test(text);
}

function hasExactNumber(
  text,
  numberPattern,
) {
  return new RegExp(
    `(^|[^0-9.])${numberPattern}(?![0-9.])`,
    "i",
  ).test(text);
}

function hasTermNearExactNumber(
  text,
  termPattern,
  numberPattern,
  distance = 80,
) {
  const term = `(?:${termPattern.source})`;
  const exactNumber = `(?:^|[^0-9.])${numberPattern}(?![0-9.])`;

  return matchesAny(text, [
    new RegExp(
      `${term}[\\s\\S]{0,${distance}}${exactNumber}`,
      "i",
    ),
    new RegExp(
      `${exactNumber}[\\s\\S]{0,${distance}}${term}`,
      "i",
    ),
  ]);
}

function hasFinalOption3Weights(answer) {
  return (
    hasTermNearExactNumber(
      answer,
      /GPAX|เกรดเฉลี่ย|subtotal|รวม/i,
      "25",
    ) &&
    hasTermNearExactNumber(
      answer,
      /English|อังกฤษ/i,
      "10",
    ) &&
    hasTermNearExactNumber(
      answer,
      /CU-?ENT/i,
      "50",
    ) &&
    hasTermNearExactNumber(
      answer,
      /Interview|สัมภาษณ์/i,
      "15",
    )
  );
}

function hasOption3GpaxAndCuEntWeights(answer) {
  return (
    hasTermNearExactNumber(
      answer,
      /GPAX|เกรดเฉลี่ย|subtotal|รวม/i,
      "25",
    ) &&
    hasTermNearExactNumber(
      answer,
      /CU-?ENT/i,
      "50",
    )
  );
}

function hasFinalOption4Weights(answer) {
  return (
    hasTermNearExactNumber(
      answer,
      /GPAX|เกรดเฉลี่ย|subtotal|รวม/i,
      "25",
    ) &&
    hasTermNearExactNumber(
      answer,
      /English|อังกฤษ/i,
      "10",
    ) &&
    hasTermNearExactNumber(
      answer,
      /TGAT/i,
      "15",
    ) &&
    hasTermNearExactNumber(
      answer,
      /TPAT3/i,
      "35",
    ) &&
    hasTermNearExactNumber(
      answer,
      /Interview|สัมภาษณ์/i,
      "15",
    )
  );
}

function hasGpaxBreakdownIfPresent(answer) {
  const mentionsBreakdown =
    /Overall|Physics|Chemistry|Mathematics|Math|ฟิสิกส์|เคมี|คณิต/i.test(
      answer,
    );

  if (!mentionsBreakdown) {
    return true;
  }

  return (
    hasTermNearExactNumber(
      answer,
      /Overall|รวม/i,
      "8",
    ) &&
    hasTermNearExactNumber(
      answer,
      /Physics|Chemistry|ฟิสิกส์|เคมี/i,
      "8\\.5",
    ) &&
    hasTermNearExactNumber(
      answer,
      /Mathematics|Math|คณิต/i,
      "8\\.5",
    )
  );
}

function matchesAtLeastOneSemantics(
  answer,
) {
  return matchesAny(answer, [
    /อย่างน้อย\s*(?:1|หนึ่ง)\s*รายการ/i,
    /อย่างน้อยหนึ่ง/i,
    /หนึ่ง\s*รายการ\s*ขึ้นไป/i,
    /(?:1|หนึ่ง)\s*รายการ\s*หรือ\s*มากกว่า/i,
    /มากกว่า\s*1\s*รายการ/i,
    /one\s+or\s+more/i,
    /at\s+least\s+one/i,
  ]);
}

function matchesNoMinimumSpecified(
  answer,
) {
  return matchesAny(answer, [
    /ยังไม่มีการกำหนดคะแนนขั้นต่ำ/i,
    /ยังไม่ได้กำหนดคะแนนขั้นต่ำ/i,
    /ไม่มีการกำหนดคะแนนขั้นต่ำ/i,
    /ไม่ได้ระบุคะแนนขั้นต่ำ/i,
    /ไม่มีการระบุคะแนนขั้นต่ำ/i,
    /ยังไม่ได้ระบุคะแนนขั้นต่ำ/i,
    /ไม่ได้ระบุ/i,
    /ยังไม่ได้ระบุ/i,
    /ไม่มีการระบุ/i,
    /ไม่ระบุ/i,
    /no minimum specified/i,
    /minimum (?:is )?not specified/i,
    /not specified/i,
    /no minimum/i,
  ]);
}

function matchesNoMinimumSpecifiedForEntity(
  answer,
  entityPattern,
) {
  const entity =
    entityPattern.source;
  const notSetThai =
    "ยังไม่ได้กำหนด|ยังไม่มีการกำหนด|ไม่มีการกำหนด|ไม่ได้ระบุ|ไม่มีการระบุ|ยังไม่ได้ระบุ";
  const noMinimumEnglish =
    "no minimum specified|minimum (?:is )?not specified|no minimum|not specified";

  return matchesAny(answer, [
    new RegExp(
      `(?:${notSetThai})[\\s\\S]{0,50}${entity}[\\s\\S]{0,50}(?:ขั้นต่ำ|minimum)`,
      "i",
    ),
    new RegExp(
      `(?:${notSetThai})[\\s\\S]{0,50}(?:ขั้นต่ำ|minimum)[\\s\\S]{0,50}${entity}`,
      "i",
    ),
    new RegExp(
      `${entity}[\\s\\S]{0,80}(?:${notSetThai}|${noMinimumEnglish})`,
      "i",
    ),
    new RegExp(
      `(?:${noMinimumEnglish})[\\s\\S]{0,80}${entity}`,
      "i",
    ),
  ]);
}

function isGroundedAnswer(record) {
  if (record.answerable !== true) {
    return fail(
      "Expected answerable=true",
    );
  }

  if (record.safeToSend !== true) {
    return fail(
      "Expected safeToSend=true",
    );
  }

  if (
    record.groundingReason !== "grounded"
  ) {
    return fail(
      `Expected groundingReason=grounded, got ${record.groundingReason}`,
    );
  }

  if (
    Number(record.citationCount) < 1
  ) {
    return fail(
      "Expected at least one citation",
    );
  }

  return pass();
}

function requireGroundedFacts(
  record,
  assertions,
) {
  const grounded =
    isGroundedAnswer(record);

  if (!grounded.pass) {
    return grounded;
  }

  for (const assertion of assertions) {
    if (!assertion.predicate(record)) {
      return fail(assertion.reason);
    }
  }

  return pass();
}

function termAndNumber(
  term,
  numberPattern,
  reason,
) {
  return {
    reason,
    predicate: ({ answer }) =>
      hasAllTerms(answer, [term]) &&
      hasNumber(answer, numberPattern),
  };
}

const inventedMathSelectionPattern =
  /ไม่มีข้อจำกัดจำนวนรายการ|unlimited|ตามความเหมาะสม|highest|best score|คะแนนสูงสุด|เลือกคะแนน|จะเลือก|โรงเรียนจะพิจารณา|คำนวณโดย|เฉลี่ย|average/i;

const extraEnglishEligibilityPattern =
  /สัญชาติ|nationality|passport|interview|portfolio|GPAX|เกรดเฉลี่ย|ต้องเรียนครบ|ต้องจบจาก/i;

const ADMISSION_CASE_DEFINITIONS = [
  ["A01", "Option1-English", "Option 1 IELTS ขั้นต่ำเท่าไหร่", "IELTS = 6.0", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /IELTS/i,
        "6(?:\\.0)?",
        "Missing expected IELTS minimum 6.0",
      ),
    ])],
  ["A02", "Option1-English", "Option 1 TOEFL iBT ขั้นต่ำเท่าไหร่", "TOEFL iBT = 80", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /TOEFL/i,
        "80",
        "Missing expected TOEFL minimum 80",
      ),
    ])],
  ["A03", "Option1-English", "Option 1 CU-TEP ขั้นต่ำเท่าไหร่", "CU-TEP = 80", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /CU-?TEP/i,
        "80",
        "Missing expected CU-TEP minimum 80",
      ),
      {
        reason:
          "Answer incorrectly claims CU-TEP minimum is unspecified",
        predicate: ({ answer }) =>
          !(
            /CU-?TEP/i.test(answer) &&
            matchesNoMinimumSpecified(
              answer,
            )
          ),
      },
    ])],
  ["A04", "Option1-English", "Option 1 Duolingo ขั้นต่ำเท่าไหร่", "Duolingo = 105", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /Duolingo/i,
        "105",
        "Missing expected Duolingo minimum 105",
      ),
    ])],
  ["A05", "Option1-Math", "Option 1 SAT Mathematics ขั้นต่ำเท่าไหร่", "SAT Mathematics = 620", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /SAT/i,
        "620",
        "Missing expected SAT Mathematics minimum 620",
      ),
    ])],
  ["A06", "Option1-Math", "Option 1 CU-AAT Mathematics ขั้นต่ำเท่าไหร่", "CU-AAT Mathematics = 480", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /CU-?AAT/i,
        "480",
        "Missing expected CU-AAT Mathematics minimum 480",
      ),
    ])],
  ["A07", "Option1-Math", "Option 1 ACT Mathematics ขั้นต่ำเท่าไหร่", "ACT Mathematics = 26", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /ACT/i,
        "26",
        "Missing expected ACT Mathematics minimum 26",
      ),
    ])],
  ["A08", "Option1-Math", "Option 1 AP Calculus AB หรือ BC ขั้นต่ำเท่าไหร่", "AP Calculus AB/BC = 4", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing expected AP Calculus AB/BC minimum 4",
        predicate: ({ answer }) =>
          /AP/i.test(answer) &&
          /Calculus|AB|BC/i.test(answer) &&
          hasNumber(answer, "4"),
      },
    ])],
  ["A09", "Option1-Science", "Option 1 CU-ATS ขั้นต่ำเท่าไหร่", "CU-ATS = 800", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /CU-?ATS/i,
        "800",
        "Missing expected CU-ATS minimum 800",
      ),
    ])],
  ["A10", "Option1-Science", "Option 1 ACT Sciences ขั้นต่ำเท่าไหร่", "ACT Sciences = 25", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing expected ACT Science minimum 25",
        predicate: ({ answer }) =>
          /ACT/i.test(answer) &&
          /Science|Sciences|วิทยาศาสตร์/i.test(answer) &&
          hasNumber(answer, "25"),
      },
    ])],
  ["A11", "Option1-Science", "Option 1 AP Chemistry และ AP Physics ใช้เกณฑ์อะไร", "AP Chemistry and AP Physics, minimum 4 each per canonical criteria", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing expected AP Chemistry and AP Physics minimum 4 each",
        predicate: ({ answer }) =>
          /Chemistry|เคมี/i.test(answer) &&
          /Physics|ฟิสิกส์/i.test(answer) &&
          hasNumber(answer, "4"),
      },
    ])],
  ["A12", "Option1-Logic", "Option 1 interview คิด 15% ใช่ไหม", "No. Interview = Pass/Fail, no percentage weight", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing Pass/Fail interview fact for Option 1",
        predicate: ({ answer }) =>
          /Pass\s*\/?\s*Fail|ผ่าน\/ไม่ผ่าน|ผ่านหรือไม่ผ่าน/i.test(answer),
      },
      {
        reason:
          "Answer does not reject 15% for Option 1 interview",
        predicate: ({ answer }) =>
          matchesAny(answer, [
            /ไม่ใช่/i,
            /ไม่คิด\s*15/i,
            /ไม่มีน้ำหนักคะแนน/i,
            /not\s+15/i,
            /no percentage/i,
          ]),
      },
    ])],
  ["A13", "Option1-Logic", "Option 1 สามารถส่งคะแนนคณิตศาสตร์มากกว่า 1 รายการได้ไหม", "At least one means one or more; do not invent score-selection rule", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing at-least-one / one-or-more Math score semantics",
        predicate: ({ answer }) =>
          matchesAtLeastOneSemantics(
            answer,
          ),
      },
      {
        reason:
          "Answer invents unsupported Math score selection/calculation rule",
        predicate: ({ answer }) =>
          !inventedMathSelectionPattern.test(answer),
      },
    ])],
  ["A14", "Option1-Logic", "Option 1 ต้องผ่าน SAT, ACT และ CU-AAT ทุกตัวหรือไม่", "No. At least one qualifying Math result; categories are AND, tests within category are alternatives", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Answer does not say SAT, ACT, and CU-AAT are not all required",
        predicate: ({ answer }) =>
          matchesAny(answer, [
            /ไม่ต้อง/i,
            /ไม่จำเป็น/i,
            /does not need/i,
            /not required/i,
          ]),
      },
      {
        reason:
          "Missing alternatives / at least one qualifying Math result",
        predicate: ({ answer }) =>
          matchesAtLeastOneSemantics(
            answer,
          ) ||
          /ทางเลือก|ตัวเลือก|alternative/i.test(answer),
      },
    ])],
  ["A15", "Option1-Rounds", "Option 1 ใช้สมัครรอบไหนได้บ้าง", "Round 1 and Round 2, same criteria", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing Round 1 and Round 2 for Option 1",
        predicate: ({ answer }) =>
          /Round\s*1|รอบ\s*1/i.test(answer) &&
          /Round\s*2|รอบ\s*2/i.test(answer),
      },
    ])],
  ["A16", "Option2", "Option 2 GPAX ขั้นต่ำเท่าไหร่", "Overall, Physics & Chemistry, Mathematics GPAX >= 3.25", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing Option 2 GPAX 3.25 across Overall, Physics & Chemistry, and Mathematics",
        predicate: ({ answer }) =>
          hasNumber(answer, "3\\.25") &&
          /Overall|GPAX\s*รวม|เกรดเฉลี่ยรวม|รวม/i.test(answer) &&
          /Physics\s*&\s*Chemistry|Physics\s+and\s+Chemistry|ฟิสิกส์และเคมี|ฟิสิกส์\s*\/\s*เคมี|ฟิสิกส์.*เคมี/i.test(answer) &&
          /Mathematics|Math|คณิตศาสตร์|คณิต/i.test(answer),
      },
    ])],
  ["A17", "Option2", "Option 2 Portfolio และ Interview มีน้ำหนักกี่เปอร์เซ็นต์", "Portfolio 35%, Interview 15%", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing Portfolio 35% and Interview 15%",
        predicate: ({ answer }) =>
          /Portfolio|แฟ้มสะสม/i.test(answer) &&
          hasNumber(answer, "35") &&
          /Interview|สัมภาษณ์/i.test(answer) &&
          hasNumber(answer, "15"),
      },
    ])],
  ["A18", "Option3", "Option 3 GPAX และ CU-ENT มีน้ำหนักเท่าไหร่", "GPAX subtotal 25%, CU-ENT 50%", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing requested Option 3 weights: GPAX subtotal 25% and CU-ENT 50%",
        predicate: ({ answer }) =>
          hasOption3GpaxAndCuEntWeights(
            answer,
          ),
      },
      {
        reason:
          "Incorrect Option 3 GPAX breakdown; expected Overall 8%, Physics & Chemistry 8.5%, Mathematics 8.5%",
        predicate: ({ answer }) =>
          hasGpaxBreakdownIfPresent(
            answer,
          ),
      },
    ])],
  ["A19", "Option3", "CU-ENT ต้องได้ขั้นต่ำเท่าไหร่สำหรับ Option 3", "No minimum CU-ENT score currently specified", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing explicit no-minimum-specified CU-ENT answer",
        predicate: ({ answer }) =>
          matchesNoMinimumSpecifiedForEntity(
            answer,
            /CU-?ENT/i,
          ),
      },
    ])],
  ["A20", "Option4", "Option 4 ใช้อะไรบ้างและแต่ละส่วนมีน้ำหนักเท่าไหร่", "GPAX subtotal 25%, English 10%, TGAT 15%, TPAT3 35%, Interview 15%", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing final Option 4 weights: GPAX subtotal 25%, English 10%, TGAT 15%, TPAT3 35%, Interview 15%",
        predicate: ({ answer }) =>
          hasFinalOption4Weights(
            answer,
          ),
      },
    ])],
  ["A21", "Option4", "TGAT และ TPAT3 มีคะแนนขั้นต่ำหรือยัง", "No minimum TGAT/TPAT3 currently specified", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing TGAT/TPAT3 no-minimum-specified fact",
        predicate: ({ answer }) =>
          /TGAT/i.test(answer) &&
          /TPAT3/i.test(answer) &&
          matchesNoMinimumSpecified(
            answer,
          ),
      },
    ])],
  ["A22", "Equivalency", "ถ้าเรียนมัธยมเป็นภาษาอังกฤษ ต้องใช้ IELTS อีกไหม", "International school with classes held in English may be equivalent to English passing score; do not invent extra conditions", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing international school English-medium equivalency fact",
        predicate: ({ answer }) =>
          /international school|โรงเรียนนานาชาติ/i.test(answer) &&
          /classes held in English|สอนเป็นภาษาอังกฤษ|เรียนเป็นภาษาอังกฤษ|จัดการเรียนการสอนเป็นภาษาอังกฤษ|ภาษาอังกฤษ/i.test(answer) &&
          /equivalent|passing score|satisfy|substitute|แทน|เทียบเท่า|ผ่านเกณฑ์|ยอมรับ/i.test(answer),
      },
      {
        reason:
          "Answer invents additional English-medium eligibility conditions",
        predicate: ({ answer }) =>
          !extraEnglishEligibilityPattern.test(answer),
      },
    ])],
  ["A23", "Routing", "สรุป IELTS requirement", "Specific IELTS summary", (record) =>
    requireGroundedFacts(record, [
      termAndNumber(
        /IELTS/i,
        "6(?:\\.0)?",
        "Missing IELTS summary minimum 6.0",
      ),
    ])],
  ["A24", "Routing", "ขอรายละเอียดเกณฑ์การรับสมัคร AY2027 ทั้งหมด", "Complete Option 1-4 and final AY2027 details", (record) =>
    requireGroundedFacts(record, [
      {
        reason:
          "Missing required AY2027 summary details",
        predicate: ({ answer }) =>
          (/Round\s*1|รอบ\s*1/i.test(answer)) &&
          (/Round\s*2|รอบ\s*2/i.test(answer)) &&
          (/Option\s*1|ตัวเลือก\s*1/i.test(answer)) &&
          (/Option\s*2|ตัวเลือก\s*2/i.test(answer)) &&
          (/Option\s*3|ตัวเลือก\s*3/i.test(answer)) &&
          (/Option\s*4|ตัวเลือก\s*4/i.test(answer)) &&
          /CU-?ENT/i.test(answer) &&
          /TGAT/i.test(answer) &&
          /TPAT3/i.test(answer) &&
          /CU-?ATS/i.test(answer) &&
          hasNumber(answer, "800") &&
          /CU-?TEP/i.test(answer) &&
          hasNumber(answer, "80") &&
          hasFinalOption3Weights(
            answer,
          ) &&
          hasFinalOption4Weights(
            answer,
          ),
      },
    ])],
  ["A25", "Unsupported", "ค่าเทอม AY2027 เท่าไหร่", "If tuition is not in retrieved knowledge, state KB lacks answer / staff confirmation required; do not guess", (record) => {
    if (record.answerable !== false) {
      return fail(
        "Expected tuition question to be answerable=false",
      );
    }

    if (record.safeToSend !== false) {
      return fail(
        "Expected tuition question to be safeToSend=false",
      );
    }

    if (
      record.groundingReason !==
      "unsupported"
    ) {
      return fail(
        `Expected groundingReason=unsupported, got ${record.groundingReason}`,
      );
    }

    if (Number(record.citationCount) !== 0) {
      return fail(
        "Expected unsupported tuition answer to have zero citations",
      );
    }

    if (/\d[\d,]*(?:\.\d+)?/.test(record.answer)) {
      return fail(
        "Unsupported tuition answer appears to invent a tuition number",
      );
    }

    return pass();
  }],
];

const ADMISSION_CASES =
  ADMISSION_CASE_DEFINITIONS.map(
    ([
      id,
      category,
      question,
      expected,
      evaluate,
    ]) => ({
      id,
      category,
      question,
      expected,
      humanReview: true,
      evaluate,
    }),
  );

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

function selectedCaseIds(args) {
  const raw =
    args.case ?? args.cases;

  if (!raw) {
    return null;
  }

  return new Set(
    String(raw)
      .split(",")
      .map((id) =>
        id.trim().toUpperCase(),
      )
      .filter(Boolean),
  );
}

function filterCasesById(cases, args) {
  const ids = selectedCaseIds(args);

  if (!ids) {
    return cases;
  }

  const selected =
    cases.filter((testCase) =>
      ids.has(testCase.id),
    );

  if (selected.length !== ids.size) {
    const found =
      new Set(
        selected.map(
          (testCase) =>
            testCase.id,
        ),
      );
    const missing =
      [...ids].filter(
        (id) => !found.has(id),
      );

    throw new Error(
      `Unknown benchmark case id(s): ${missing.join(", ")}`,
    );
  }

  return selected;
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

function normalizeEvaluationResult(
  evaluation,
) {
  if (
    typeof evaluation === "boolean"
  ) {
    return evaluation
      ? pass()
      : fail(
          "Automated expectation failed",
        );
  }

  if (
    evaluation &&
    typeof evaluation === "object" &&
    "pass" in evaluation
  ) {
    return evaluation.pass
      ? pass()
      : fail(
          evaluation.reason ||
            "Automated expectation failed",
        );
  }

  return fail(
    "Evaluator returned an invalid result",
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

    const evaluation =
      response.ok &&
      body.ok === true
        ? normalizeEvaluationResult(
            testCase.evaluate(
              record,
            ),
          )
        : fail(
            record.error ||
              `HTTP ${response.status}`,
          );
    const automatedPass =
      evaluation.pass;

    return {
      ...record,
      automatedPass,
      failureReason:
        automatedPass
          ? ""
          : record.error ||
            evaluation.reason,
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

function admissionCaseById(id) {
  const testCase =
    ADMISSION_CASES.find(
      (item) => item.id === id,
    );

  if (!testCase) {
    throw new Error(
      `Missing admission benchmark case: ${id}`,
    );
  }

  return testCase;
}

function groundedRecordFor(
  id,
  answer,
) {
  const testCase =
    admissionCaseById(id);

  return {
    id:
      testCase.id,
    category:
      testCase.category,
    question:
      testCase.question,
    expected:
      testCase.expected,
    answer,
    answerable: true,
    safeToSend: true,
    groundingReason:
      "grounded",
    citationCount: 1,
  };
}

function runSelfTests() {
  const a18FinalAnswer =
    "Option 3 (CU-ENT):\n\n- GPAX รวม 25%\n- CU-ENT 50%\n\nโดย GPAX แบ่งเป็น Overall GPAX 8%, Physics & Chemistry GPAX 8.5%\nและ Mathematics GPAX 8.5%";
  const a16Answer =
    "Option 2 (Portfolio) กำหนด GPAX ขั้นต่ำ 3.25 และต้องผ่านครบทั้ง 3 ส่วน ได้แก่\n\n- GPAX รวม: อย่างน้อย 3.25\n- GPAX ฟิสิกส์และเคมี: อย่างน้อย 3.25\n- GPAX คณิตศาสตร์: อย่างน้อย 3.25";
  const a19Answer =
    "สำหรับ Option 3 (CU-ENT) ปีการศึกษา AY2027\nยังไม่ได้กำหนดคะแนน CU-ENT ขั้นต่ำ ไว้ในเกณฑ์รับสมัคร";
  const a20FinalAnswer =
    "Option 4 ใช้ GPAX subtotal 25%, English 10%, TGAT 15%, TPAT3 35% และ Interview 15%";
  const a20OldAnswer =
    "Option 4 ใช้ GPAX 25.5%, English 8.5%, TGAT 17%, TPAT3 34% และ Interview 15%";
  const a22FinalAnswer =
    "ผู้สมัครจาก international school ที่ classes held in English อาจถือว่าเทียบเท่ากับ English passing score ได้";
  const a24FinalAnswer =
    "AY2027 เปิด Round 1 และ Round 2 ครอบคลุม Option 1, Option 2, Option 3 และ Option 4 โดย Option 1 มี CU-TEP 80 และ CU-ATS 800; Option 3 ใช้ GPAX subtotal 25%, English 10%, CU-ENT 50% และ Interview 15%; Option 4 ใช้ GPAX subtotal 25%, English 10%, TGAT 15%, TPAT3 35% และ Interview 15%";
  const a13Answer =
    "ได้ครับ สำหรับ Option 1 สามารถส่งผลคะแนนคณิตศาสตร์ที่ผ่านเกณฑ์ได้\n1 รายการหรือมากกว่า ไม่ได้จำกัดว่าต้องส่งได้เพียงรายการเดียว\n\nอย่างไรก็ตาม เกณฑ์ AY2027 ไม่ได้ระบุวิธีเลือกหรือวิธีนำคะแนนหลายรายการ\nในหมวดคณิตศาสตร์ไปคำนวณคะแนน";
  const a21Answer =
    "ยังไม่มีการกำหนดคะแนนขั้นต่ำ ทั้ง TGAT และ TPAT3";

  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A16")
        .evaluate(
          groundedRecordFor(
            "A16",
            a16Answer,
          ),
        ),
    ).pass,
    true,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A18")
        .evaluate(
          groundedRecordFor(
            "A18",
            a18FinalAnswer,
          ),
        ),
    ).pass,
    true,
  );
  assert.equal(
    matchesNoMinimumSpecifiedForEntity(
      a19Answer,
      /CU-?ENT/i,
    ),
    true,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A19")
        .evaluate(
          groundedRecordFor(
            "A19",
            a19Answer,
          ),
        ),
    ).pass,
    true,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A20")
        .evaluate(
          groundedRecordFor(
            "A20",
            a20FinalAnswer,
          ),
        ),
    ).pass,
    true,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A20")
        .evaluate(
          groundedRecordFor(
            "A20",
            a20OldAnswer,
          ),
        ),
    ).pass,
    false,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A22")
        .evaluate(
          groundedRecordFor(
            "A22",
            a22FinalAnswer,
          ),
        ),
    ).pass,
    true,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A24")
        .evaluate(
          groundedRecordFor(
            "A24",
            a24FinalAnswer,
          ),
        ),
    ).pass,
    true,
  );
  assert.equal(
    matchesAtLeastOneSemantics(
      a13Answer,
    ),
    true,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A13")
        .evaluate(
          groundedRecordFor(
            "A13",
            a13Answer,
          ),
        ),
    ).pass,
    true,
  );
  assert.equal(
    matchesNoMinimumSpecified(
      a21Answer,
    ),
    true,
  );
  assert.equal(
    normalizeEvaluationResult(
      admissionCaseById("A21")
        .evaluate(
          groundedRecordFor(
            "A21",
            a21Answer,
          ),
        ),
    ).pass,
    true,
  );

  console.log(
    "rag-v2 admission benchmark self-tests passed",
  );
}

async function main() {
  const args =
    parseArgs(process.argv);

  if (args["self-test"] === "true") {
    runSelfTests();
    return;
  }

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
    filterCasesById(
      args.smoke === "true"
        ? SMOKE_CASES
        : ADMISSION_CASES,
      args,
    );

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
