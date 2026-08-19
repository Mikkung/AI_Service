import assert from "node:assert/strict";

import {
  MISSING_INFORMATION_FALLBACK,
  answerChangesSubject,
  containsInternalRagTerminology,
  contextAppearsToAnswerQuestion,
  ensureCompletePublicAnswer,
  repairPublicAnswerDeterministically,
  shouldAttemptAnswerRepair,
  validatePublicAnswer,
} from "../public-answer-validator";

function assertViolation(
  answer: string,
  context: string,
  violation: string,
  userMessage?: string,
): void {
  const result =
    validatePublicAnswer(
      answer,
      context,
      {
        userMessage,
      },
    );

  assert.equal(result.ok, false);
  assert.ok(
    result.violations.includes(
      violation as never,
    ),
    `Expected violation ${violation}, got ${result.violations.join(", ")}`,
  );
}

function assertDoesNotMatch(
  answer: string,
  pattern: RegExp,
): void {
  assert.equal(
    pattern.test(answer),
    false,
    `Unexpected match ${pattern} in: ${answer}`,
  );
}

assert.equal(
  containsInternalRagTerminology(
    "อ้างอิงจาก chunk นี้ คะแนนขั้นต่ำคือ 6.0",
  ),
  true,
);

assert.equal(
  validatePublicAnswer(
    "จาก CONTEXT 1 ระบุว่าเป็น Pass/Fail",
    "Option 1 interview is Pass/Fail.",
  ).violations.includes(
    "internal_rag_terminology",
  ),
  true,
);

assert.equal(
  validatePublicAnswer(
    "The RETRIEVED CONTEXT says IELTS minimum is 6.0.",
    "IELTS minimum is 6.0.",
  ).violations.includes(
    "internal_rag_terminology",
  ),
  true,
);

assert.equal(
  validatePublicAnswer(
    "บริบทของคำถามคือคะแนน IELTS",
    "IELTS minimum is 6.0.",
  ).ok,
  true,
);

assertViolation(
  "เลือกใช้เพียงหนึ่งรายการจากตัวเลือกที่ยอมรับ",
  "Applicants must have at least one accepted Mathematics result.",
  "at_least_one_changed_to_only_one",
);

assertViolation(
  MISSING_INFORMATION_FALLBACK,
  "No minimum CU-ENT score is currently specified.",
  "explicit_no_minimum_treated_as_missing",
  "CU-ENT ต้องได้ขั้นต่ำเท่าไหร่สำหรับ Option 3",
);

assert.equal(
  repairPublicAnswerDeterministically(
    MISSING_INFORMATION_FALLBACK,
    "No minimum CU-ENT score is currently specified.",
    {
      userMessage:
        "CU-ENT ต้องได้ขั้นต่ำเท่าไหร่สำหรับ Option 3",
    },
  ),
  "ปัจจุบันเกณฑ์ AY2027 ยังไม่ได้ระบุคะแนนขั้นต่ำของ CU-ENT",
);

const cuEntNoMinimumAnswer =
  ensureCompletePublicAnswer(
    "ข",
    "No minimum CU-ENT score is currently specified.",
    {
      userMessage:
        "CU-ENT ต้องได้ขั้นต่ำเท่าไหร่สำหรับ Option 3",
    },
  );

assert.equal(
  cuEntNoMinimumAnswer,
  "ปัจจุบันเกณฑ์ AY2027 ยังไม่ได้ระบุคะแนนขั้นต่ำของ CU-ENT",
);

assert.ok(
  cuEntNoMinimumAnswer.length > 1,
);

assert.notEqual(
  cuEntNoMinimumAnswer,
  MISSING_INFORMATION_FALLBACK,
);

assertViolation(
  "คะแนนขั้นต่ำคือ 6.0 กรุณาติดต่อ ISE เพื่อสอบถามเพิ่มเติม",
  "IELTS minimum is 6.0.",
  "unsupported_contact_advice",
);

assert.equal(
  shouldAttemptAnswerRepair(0),
  true,
);

assert.equal(
  shouldAttemptAnswerRepair(1),
  false,
);

const admissionCriteriaOnlyContext = `
Option 3 accepts CU-ENT. No minimum CU-ENT score is currently specified.
Option 1 requires at least one English result, at least one Mathematics result, and at least one Science pathway.
IELTS minimum score is 6.0.
`.trim();

assert.equal(
  repairPublicAnswerDeterministically(
    MISSING_INFORMATION_FALLBACK,
    admissionCriteriaOnlyContext,
    {
      userMessage:
        "ค่าเทอม AY2027 เท่าไหร่",
    },
  ),
  MISSING_INFORMATION_FALLBACK,
);

const tuitionFallbackAnswer =
  ensureCompletePublicAnswer(
    "ข",
    admissionCriteriaOnlyContext,
    {
      userMessage:
        "ค่าเทอม AY2027 เท่าไหร่",
    },
  );

assert.equal(
  tuitionFallbackAnswer,
  MISSING_INFORMATION_FALLBACK,
);

assert.ok(
  tuitionFallbackAnswer.length > 1,
);

assert.equal(
  answerChangesSubject(
    "ค่าเทอม AY2027 เท่าไหร่",
    "ปัจจุบันเกณฑ์ AY2027 ยังไม่ได้ระบุคะแนนขั้นต่ำของ CU-ENT",
  ),
  true,
);

assert.equal(
  contextAppearsToAnswerQuestion(
    "ค่าเทอม AY2027 เท่าไหร่",
    admissionCriteriaOnlyContext,
  ),
  false,
);

assert.equal(
  validatePublicAnswer(
    "หากเลือกใช้ IELTS เพื่อผ่านเกณฑ์ภาษาอังกฤษ คะแนนขั้นต่ำคือ 6.0 โดย IELTS เป็นหนึ่งในตัวเลือกคะแนนภาษาอังกฤษที่ยอมรับ",
    "IELTS minimum score is 6.0. IELTS is one accepted English option.",
    {
      userMessage:
        "สรุป IELTS requirement",
    },
  ).ok,
  true,
);

assertViolation(
  "ต้องมีอย่างน้อยหนึ่งผลการสอบ IELTS",
  "IELTS minimum score is 6.0. IELTS is one accepted English option.",
  "accepted_alternative_made_mandatory",
);

const ieltsRequirementContext =
  "IELTS minimum score is 6.0. IELTS is one accepted English option.";

const goodIeltsRequirementAnswer =
  "หากเลือกใช้ IELTS เพื่อผ่านเกณฑ์ภาษาอังกฤษ คะแนนขั้นต่ำคือ 6.0 โดย IELTS เป็นหนึ่งในตัวเลือกผลสอบภาษาอังกฤษที่ยอมรับ";

assert.equal(
  validatePublicAnswer(
    goodIeltsRequirementAnswer,
    ieltsRequirementContext,
    {
      userMessage:
        "สรุป IELTS requirement",
    },
  ).ok,
  true,
);

assert.ok(
  goodIeltsRequirementAnswer.includes(
    "IELTS",
  ),
);

assert.ok(
  goodIeltsRequirementAnswer.includes(
    "6.0",
  ),
);

assert.ok(
  /ตัวเลือกผลสอบภาษาอังกฤษที่ยอมรับ/.test(
    goodIeltsRequirementAnswer,
  ),
);

assertViolation(
  "ต้องมีอย่างน้อยหนึ่งรายการผลสอบ IELTS ที่ผ่านเกณฑ์นี้",
  ieltsRequirementContext,
  "accepted_alternative_made_mandatory",
  "สรุป IELTS requirement",
);

const repairedIeltsRequirement =
  repairPublicAnswerDeterministically(
    "คะแนนขั้นต่ำคือ 6.0 และต้องมีอย่างน้อยหนึ่งรายการผลสอบ IELTS ที่ผ่านเกณฑ์นี้",
    ieltsRequirementContext,
    {
      userMessage:
        "สรุป IELTS requirement",
    },
  );

assert.ok(
  repairedIeltsRequirement.includes(
    "IELTS",
  ),
);

assert.ok(
  repairedIeltsRequirement.includes(
    "6.0",
  ),
);

assert.ok(
  /ตัวเลือกผลสอบภาษาอังกฤษที่ยอมรับ/.test(
    repairedIeltsRequirement,
  ),
);

assert.equal(
  /ต้องมี[^.\n]*IELTS/i.test(
    repairedIeltsRequirement,
  ),
  false,
);

assert.equal(
  /IELTS\s+is\s+(?:required|mandatory)/i.test(
    repairedIeltsRequirement,
  ),
  false,
);

assert.equal(
  validatePublicAnswer(
    "ไม่จำเป็นต้องผ่าน SAT, ACT และ CU-AAT ทุกตัว ผู้สมัครต้องมีผลสอบคณิตศาสตร์ที่ผ่านเกณฑ์อย่างน้อยหนึ่งรายการจากตัวเลือกที่ยอมรับ",
    "Applicants must have at least one accepted Mathematics result.",
    {
      userMessage:
        "Option 1 ต้องผ่าน SAT, ACT และ CU-AAT ทุกตัวหรือไม่",
    },
  ).ok,
  true,
);

assertViolation(
  "เลือกใช้เพียงตัวเดียวจาก SAT, ACT หรือ CU-AAT",
  "Applicants must have at least one accepted Mathematics result.",
  "at_least_one_changed_to_only_one",
);

assert.equal(
  validatePublicAnswer(
    "ได้ครับ ผู้สมัครสามารถส่งผลสอบคณิตศาสตร์ที่ผ่านเกณฑ์ได้หนึ่งรายการขึ้นไป แต่ข้อมูลที่ตรวจสอบได้ไม่ได้ระบุวิธีเลือกหรือคำนวณคะแนนเมื่อส่งหลายรายการ",
    "One or more qualifying Mathematics results may be submitted. The selection or calculation rule for multiple submitted results is not specified.",
    {
      userMessage:
        "Option 1 สามารถส่งคะแนนคณิตศาสตร์มากกว่า 1 รายการได้ไหม",
    },
  ).ok,
  true,
);

assertViolation(
  "ได้ครับ ไม่มีข้อจำกัดจำนวนรายการ",
  "One or more qualifying Mathematics results may be submitted. The selection or calculation rule for multiple submitted results is not specified.",
  "unsupported_multiple_score_submission_rule",
);

const option1InterviewAnswer =
  "ไม่ใช่ครับ สำหรับ Option 1 การสัมภาษณ์เป็น Pass/Fail และไม่มีน้ำหนักคะแนนเป็นเปอร์เซ็นต์";

assert.equal(
  validatePublicAnswer(
    option1InterviewAnswer,
    "For Option 1, interview is Pass/Fail and has no percentage weight.",
    {
      userMessage:
        "Option 1 interview คิด 15% ใช่ไหม",
    },
  ).ok,
  true,
);

assert.ok(
  option1InterviewAnswer.startsWith(
    "ไม่ใช่ครับ",
  ),
);

assert.ok(
  /Pass\/Fail/.test(
    option1InterviewAnswer,
  ),
);

assert.ok(
  /ไม่มีน้ำหนักคะแนนเป็นเปอร์เซ็นต์/.test(
    option1InterviewAnswer,
  ),
);

assertDoesNotMatch(
  option1InterviewAnswer,
  /Option 2|Option 3|Option 4/,
);

const cuTepMinimumAnswer =
  "สำหรับ Option 1 หากเลือกใช้ CU-TEP เพื่อผ่านเกณฑ์ภาษาอังกฤษ คะแนนขั้นต่ำคือ 80";

assert.equal(
  validatePublicAnswer(
    cuTepMinimumAnswer,
    "CU-TEP minimum score is 80. CU-TEP is an accepted English option for Option 1.",
    {
      userMessage:
        "Option 1 CU-TEP ขั้นต่ำเท่าไหร่",
    },
  ).ok,
  true,
);

assert.ok(
  cuTepMinimumAnswer.startsWith(
    "สำหรับ Option 1",
  ),
);

assert.ok(
  /CU-TEP/.test(
    cuTepMinimumAnswer,
  ),
);

assert.ok(
  /80/.test(
    cuTepMinimumAnswer,
  ),
);

assert.ok(
  /หากเลือกใช้ CU-TEP/.test(
    cuTepMinimumAnswer,
  ),
);

assertDoesNotMatch(
  cuTepMinimumAnswer,
  /ไม่ได้ระบุคะแนนขั้นต่ำ|ไม่มีการระบุคะแนนขั้นต่ำ|ต้องมี[^.\n]*CU-TEP/i,
);

const option1MathAlternativesAnswer =
  "ไม่ต้องครับ ผู้สมัครต้องมีผลสอบคณิตศาสตร์ที่ผ่านเกณฑ์อย่างน้อยหนึ่งรายการจากตัวเลือกที่ยอมรับ เช่น SAT Mathematics, CU-AAT Mathematics หรือ ACT Mathematics";

assert.equal(
  validatePublicAnswer(
    option1MathAlternativesAnswer,
    "Applicants must have at least one accepted Mathematics result. Accepted alternatives include SAT Mathematics, CU-AAT Mathematics, ACT Mathematics, or other listed items.",
    {
      userMessage:
        "Option 1 ต้องผ่าน SAT, ACT และ CU-AAT ทุกตัวหรือไม่",
    },
  ).ok,
  true,
);

assert.ok(
  option1MathAlternativesAnswer.startsWith(
    "ไม่ต้องครับ",
  ),
);

assert.ok(
  /อย่างน้อยหนึ่งรายการ/.test(
    option1MathAlternativesAnswer,
  ),
);

assert.ok(
  /SAT Mathematics/.test(
    option1MathAlternativesAnswer,
  ) &&
    /CU-AAT Mathematics/.test(
      option1MathAlternativesAnswer,
    ) &&
    /ACT Mathematics/.test(
      option1MathAlternativesAnswer,
    ),
);

assertDoesNotMatch(
  option1MathAlternativesAnswer,
  /เพียงหนึ่ง|เพียงตัวเดียว|only one|ผู้สมัครSAT|ต้องผ่าน SAT, ACT และ CU-AAT ทุกตัว/i,
);

assertDoesNotMatch(
  option1MathAlternativesAnswer,
  /(จากตัวเลือกที่ยอมรับ){2,}/,
);

const multipleMathScoresAnswer =
  "ได้ครับ เกณฑ์กำหนดว่าต้องมีผลสอบคณิตศาสตร์ที่ผ่านเกณฑ์อย่างน้อยหนึ่งรายการ จึงสามารถส่งผลสอบหนึ่งรายการขึ้นไปได้ อย่างไรก็ตาม เกณฑ์ไม่ได้ระบุวิธีเลือกหรือคำนวณคะแนนหากส่งผลสอบมากกว่าหนึ่งรายการ";

assert.equal(
  validatePublicAnswer(
    multipleMathScoresAnswer,
    "One or more qualifying Mathematics results may be submitted. The selection or calculation rule for multiple submitted results is not specified.",
    {
      userMessage:
        "Option 1 สามารถส่งคะแนนคณิตศาสตร์มากกว่า 1 รายการได้ไหม",
    },
  ).ok,
  true,
);

assert.ok(
  multipleMathScoresAnswer.startsWith(
    "ได้ครับ",
  ),
);

assert.ok(
  /อย่างน้อยหนึ่งรายการ/.test(
    multipleMathScoresAnswer,
  ),
);

assert.ok(
  /ไม่ได้ระบุวิธีเลือกหรือคำนวณคะแนน/.test(
    multipleMathScoresAnswer,
  ),
);

assertDoesNotMatch(
  multipleMathScoresAnswer,
  /ตามความเหมาะสม|unlimited|ไม่มีข้อจำกัดจำนวนรายการ|โรงเรียนจะพิจารณา|SAT Mathematics|CU-AAT Mathematics|ACT Mathematics/i,
);

assert.equal(
  validatePublicAnswer(
    goodIeltsRequirementAnswer,
    ieltsRequirementContext,
    {
      userMessage:
        "สรุป IELTS requirement",
    },
  ).ok,
  true,
);

assertDoesNotMatch(
  goodIeltsRequirementAnswer,
  /ต้องมี[^.\n]*IELTS|IELTS\s+is\s+(?:required|mandatory)|subscore|คะแนนย่อย|Option 2|Option 3|Option 4/i,
);

assert.equal(
  (
    goodIeltsRequirementAnswer.match(
      /IELTS/g,
    ) ?? []
  ).length,
  2,
);
