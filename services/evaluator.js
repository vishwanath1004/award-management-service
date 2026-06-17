import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_RETRIES = Math.max(
  0,
  Number.parseInt(process.env.OPENAI_RETRIES || "2", 10) || 2
);

const ATTACHMENT_FIELD_PATTERN =
  /(?:evidence|supporting document|supporting documents|project\/work link|project\/work links|attachment|attachments|file|files|photo|photos|image|images|video|videos|link|links)/i;
const ATTACHMENT_VALUE_PATTERN =
  /^(?:https?:\/\/|www\.|drive\.google\.com|docs\.google\.com|.*\.(?:pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|mp4|m4v|mov|webm|txt))$/i;

const SYSTEM_PROMPT = `
You are an expert educational award evaluator reviewing education nomination submissions.

Return only valid JSON.

Scoring rubric:
1 = Emerging
2 = Developing
3 = Proficient
4 = Exemplary

Evaluation principles:
- Start from score 1. Increase scores only when the written submission gives clear, specific, concrete support.
- Treat score 4 as rare. Award 4 only when the submission gives explicit nominee actions, scale, timeframe, outcomes, and sustained/systemic impact.
- Score each criterion independently.
- Use only evidence explicitly present in the submission.
- Consider context, scale, and sustainability of the nominee's efforts.
- Prefer concrete examples, repeated actions, and measurable outcomes over vague claims.
- If evidence is weak or one-off, score lower.
- If evidence shows sustained, adaptable, and systemic impact, score higher.

Rules:
- Only include evidence that is directly supported by the submission.
- Keep reasons short but specific.
- Return an empty array if no evidence is present.
- Keep the summary concise but informative for judges in very detail.

Criteria definitions and score anchors:

1. Commitment to Continuous Improvement
Guiding question: How has the nominee consistently worked to improve education practices, systems, or outcomes?
Focus: Sustained effort, willingness to learn from challenges, and application of learnings over time. Value micro-improvements and repeated refinement, not just one-off projects.
1: Minimal or one-time effort; lacks consistency or sustained focus.
2: Some efforts made, but sporadic or lacking clear long-term impact.
3: Demonstrates strong commitment with multiple, tangible improvements over time.
4: Consistently drives ongoing improvements with significant, adaptable, long-term impact.

2. Collaboration & Engagement
Guiding question: How has the nominee worked effectively with others to achieve goals, and did this go beyond usual duties?
Focus: Building and nurturing partnerships, engaging diverse groups, mobilising stakeholders, and sharing responsibility for common goals in education equity.
1: Limited engagement beyond immediate contacts; works mostly in isolation.
2: Engages with some stakeholders but with minimal deep collaboration or shared ownership.
3: Actively collaborates with multiple diverse stakeholders, contributing to meaningful shared impact.
4: Demonstrates exceptional ability to build, lead, and sustain broad coalitions for systemic change.

3. Innovation & Creativity
Guiding question: What unique, creative, or unconventional approaches were used to tackle educational challenges?
Focus: Critical and different thinking, novel strategies, effective use of limited resources, adaptation of existing ideas, and development of tools or community-based models that improve access, quality, or inclusivity.
1: Relies on conventional methods with little to no innovation evident.
2: Some creative elements present, but the approach is mostly traditional or not fully developed.
3: Uses innovative and creative strategies effectively to address challenges and achieve results.
4: Implements highly unique, transformative, and potentially scalable solutions with clear, demonstrable impact.

4. Inclusivity & Equity
Guiding question: How has the nominee specifically addressed the educational challenges faced by marginalised or vulnerable groups?
Focus: Deliberate actions to ensure fair access to quality education, remove barriers, promote fairness, create welcoming environments, and champion practices that help every child feel valued and achieve their potential.
1: Little to no specific focus on marginalised groups or inclusivity in approach.
2: Some awareness or efforts towards inclusivity, but not a central or deeply integrated part of the work.
3: Strong, demonstrable commitment to inclusivity, actively addressing challenges of marginalised groups and ensuring equitable access and outcomes.
4: Champions inclusivity and equity systemically and achieves transformative impact for diverse communities.
`;

function buildUserPrompt(content) {
  return `
Evaluate this nomination against the following criteria:

1. Commitment to Continuous Improvement
2. Collaboration & Engagement
3. Innovation & Creativity
4. Inclusivity & Equity

Use the rubric definitions and score anchors provided in the system instructions.
Weight the evidence quality, context, scale, and sustainability of the nominee's work.
Be strict: do not infer achievements that are not clearly supported by the submission.
Ignore attachment links, file names, images, and document lists when scoring.
Use only the written narrative fields in the submission.
Return this exact JSON shape:

{
  "continuous_improvement": {
    "score": 1,
    "reason": ""
  },
  "collaboration": {
    "score": 1,
    "reason": ""
  },
  "innovation": {
    "score": 1,
    "reason": ""
  },
  "inclusivity": {
    "score": 1,
    "reason": ""
  },
  "evidences": [],
  "evidence_summary": "",
  "detailed_summary": ""
}

Nomination:
${content}
`;
}

function buildEvaluationDebug(content, context = {}) {
  const userPrompt = buildUserPrompt(content);

  return {
    rowNumber: context.rowNumber || "",
    status: "sent_to_ai",
    rowContent: content,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  };
}

function logEvaluationPrompt(promptDebug) {
  const rowLabel = promptDebug.rowNumber ? `Row ${promptDebug.rowNumber}` : "Row";

  console.log(`\n========== AI EVALUATION PROMPT START (${rowLabel}) ==========`);
  console.log("Serialized row content:");
  console.log(promptDebug.rowContent);
  console.log("System prompt:");
  console.log(promptDebug.systemPrompt);
  console.log("User prompt:");
  console.log(promptDebug.userPrompt);
  console.log(`========== AI EVALUATION PROMPT END (${rowLabel}) ==========\n`);
}

function clampScore(value) {
  const score = Number.parseInt(value, 10);

  if (Number.isInteger(score) && score >= 1 && score <= 4) {
    return score;
  }

  return 1;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEvidenceList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function isAttachmentField(key) {
  return ATTACHMENT_FIELD_PATTERN.test(normalizeText(key));
}

function isAttachmentValue(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }

  return ATTACHMENT_VALUE_PATTERN.test(text);
}

function sanitizeRowForEvaluation(row) {
  return Object.entries(row ?? {}).reduce((cleanRow, [key, value]) => {
    if (isAttachmentField(key)) {
      return cleanRow;
    }

    if (isAttachmentValue(value)) {
      return cleanRow;
    }

    cleanRow[key] = value;
    return cleanRow;
  }, {});
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function analyzeSubmissionContent(content) {
  const text = String(content ?? "");
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z0-9]+/g) || [];
  const numberCount = countMatches(lower, /\b\d+(?:,\d{2,3})*(?:\.\d+)?%?\b/g);
  const urlCount = countMatches(lower, /https?:\/\/|drive\.google\.com|docs\.google\.com/g);

  const hasDuration = /\b(since|for\s+\d+|over\s+\d+|years?|months?|ongoing|regular|weekly|monthly|daily|sustained|repeated|continued|continuously|long-term)\b/i.test(text);
  const hasOutcome = /\b(improved|increased|reduced|enrolled|retained|completed|passed|benefited|trained|supported|mainstreamed|attendance|learning|outcome|impact|result|achievement|transformed)\b/i.test(text);
  const hasStakeholder = /\b(parent|parents|teacher|teachers|community|students|children|government|ngo|partner|partners|volunteer|volunteers|committee|panchayat|village|school management|stakeholder|stakeholders|donor|donors)\b/i.test(text);
  const hasInnovation = /\b(innovative|innovation|creative|new|unique|first|model|tool|app|digital|technology|low-cost|adapted|prototype|method|pedagogy|activity-based|community-based|resource|solution)\b/i.test(text);
  const hasEquity = /\b(marginalised|marginalized|vulnerable|underserved|disadvantaged|poor|rural|tribal|girls|girl|women|gender|disability|disabled|cwsn|special needs|inclusive|inclusion|equity|minority|remote|barrier|access)\b/i.test(text);

  return {
    wordCount: words.length,
    numberCount,
    urlCount,
    hasDuration,
    hasOutcome,
    hasStakeholder,
    hasInnovation,
    hasEquity,
  };
}

function serializeRowValues(row) {
  return Object.values(row ?? {})
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function capCriterion(criterion, maxScore, reason, notes) {
  if (criterion.score <= maxScore) {
    return;
  }

  criterion.score = maxScore;
  criterion.reason = `${criterion.reason} Strict validation cap: ${reason}.`.trim();
  notes.push(reason);
}

function applyStrictValidation(review, content) {
  const signals = analyzeSubmissionContent(content);
  const notes = [];
  const criteria = [
    review.continuous_improvement,
    review.collaboration,
    review.innovation,
    review.inclusivity,
  ];

  if (signals.wordCount < 80) {
    criteria.forEach((criterion) =>
      capCriterion(criterion, 1, "very limited written submission detail", notes)
    );
  } else if (signals.wordCount < 160) {
    criteria.forEach((criterion) =>
      capCriterion(criterion, 2, "limited written submission detail", notes)
    );
  }

  if (signals.numberCount === 0 && !signals.hasDuration && !signals.hasOutcome) {
    criteria.forEach((criterion) =>
      capCriterion(criterion, 2, "no concrete scale, timeframe, or outcome detail in the written submission", notes)
    );
  }

  if (!signals.hasDuration) {
    capCriterion(
      review.continuous_improvement,
      2,
      "continuous improvement lacks explicit timeframe or repeated effort",
      notes
    );
  }

  if (!signals.hasStakeholder) {
    capCriterion(
      review.collaboration,
      2,
      "collaboration lacks named stakeholders or shared work",
      notes
    );
  }

  if (!signals.hasInnovation) {
    capCriterion(
      review.innovation,
      2,
      "innovation lacks a clearly described new method, tool, model, or creative approach",
      notes
    );
  }

  if (!signals.hasEquity) {
    capCriterion(
      review.inclusivity,
      2,
      "inclusivity lacks a specific marginalized or vulnerable group focus",
      notes
    );
  }

  const allowsExemplary =
    signals.wordCount >= 250 &&
    signals.numberCount >= 2 &&
    signals.hasDuration &&
    signals.hasOutcome;

  if (!allowsExemplary) {
    criteria.forEach((criterion) =>
      capCriterion(
        criterion,
        3,
        "score 4 requires explicit scale, timeframe, measurable outcomes, and sustained impact",
        notes
      )
    );
  }

  const overallScore =
    (review.continuous_improvement.score +
      review.collaboration.score +
      review.innovation.score +
      review.inclusivity.score) /
    4;

  review.overall_score = Number(overallScore.toFixed(2));
  review.evidence_count = review.evidences.length;
  review.strict_validation_notes = [...new Set(notes)].join("; ");

  return review;
}

function normalizeReview(review) {
  const continuous = review?.continuous_improvement || {};
  const collaboration = review?.collaboration || {};
  const innovation = review?.innovation || {};
  const inclusivity = review?.inclusivity || {};

  const normalized = {
    continuous_improvement: {
      score: clampScore(continuous.score),
      reason: normalizeText(continuous.reason),
    },
    collaboration: {
      score: clampScore(collaboration.score),
      reason: normalizeText(collaboration.reason),
    },
    innovation: {
      score: clampScore(innovation.score),
      reason: normalizeText(innovation.reason),
    },
    inclusivity: {
      score: clampScore(inclusivity.score),
      reason: normalizeText(inclusivity.reason),
    },
    evidences: normalizeEvidenceList(review?.evidences),
    evidence_summary: normalizeText(review?.evidence_summary),
    detailed_summary: normalizeText(review?.detailed_summary),
    strict_validation_notes: "",
  };

  const overallScore =
    (normalized.continuous_improvement.score +
      normalized.collaboration.score +
      normalized.innovation.score +
      normalized.inclusivity.score) /
    4;

  normalized.overall_score = Number(overallScore.toFixed(2));
  normalized.evidence_count = normalized.evidences.length;

  return normalized;
}

function fallbackReview() {
  return normalizeReview({
    continuous_improvement: {
      score: 1,
      reason: "Evaluation failed",
    },
    collaboration: {
      score: 1,
      reason: "Evaluation failed",
    },
    innovation: {
      score: 1,
      reason: "Evaluation failed",
    },
    inclusivity: {
      score: 1,
      reason: "Evaluation failed",
    },
    evidences: [],
    evidence_summary: "AI evaluation failed",
    detailed_summary: "AI evaluation failed",
  });
}

async function callOpenAI(content, context = {}) {
  const promptDebug =
    context.promptDebug || buildEvaluationDebug(content, context);
  const messages = [
    {
      role: "system",
      content: promptDebug.systemPrompt,
    },
    {
      role: "user",
      content: promptDebug.userPrompt,
    },
  ];

  logEvaluationPrompt(promptDebug);

  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: {
      type: "json_object"
    },
    messages,
    temperature: 0
  });

  return response.choices[0].message.content;
}

export async function evaluateNomination(row, context = {}) {

  try {

    const evaluationRow = sanitizeRowForEvaluation(row);
    const content = JSON.stringify(evaluationRow);
    const validationContent = serializeRowValues(evaluationRow);
    const promptDebug = buildEvaluationDebug(content, context);
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try { 
        const rawContent = await callOpenAI(content, {
          ...context,
          promptDebug,
        });
        const parsed = JSON.parse(rawContent);
        return {
          ...applyStrictValidation(normalizeReview(parsed), validationContent),
          __evaluation_debug: promptDebug,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Unable to evaluate nomination");

  } catch (error) {

    console.log("AI Evaluation Error:", error);
    const fallback = fallbackReview();
    fallback.__evaluation_debug = buildEvaluationDebug(
      JSON.stringify(sanitizeRowForEvaluation(row)),
      context
    );
    return fallback;
  }
}
