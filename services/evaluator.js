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

const SYSTEM_PROMPT = `
You are an expert educational award evaluator reviewing education nomination submissions.

Return only valid JSON.

Scoring rubric:
1 = Emerging
2 = Developing
3 = Proficient
4 = Exemplary

Evaluation principles:
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
    detailed_summary: normalizeText(review?.detailed_summary),
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

    const content = JSON.stringify(row);
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
          ...normalizeReview(parsed),
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
      JSON.stringify(row),
      context
    );
    return fallback;
  }
}
