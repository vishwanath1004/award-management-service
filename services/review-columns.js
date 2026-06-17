export const REVIEW_COLUMNS = [
  { key: "nominee_name", label: "Nominee" },
  { key: "evaluation_status", label: "Status" },
  { key: "self_nomination_detected", label: "Self Nomination" },
  { key: "self_nomination_reason", label: "Self Nomination Reason" },
  { key: "strict_validation_notes", label: "Strict Validation Notes" },
  { key: "overall_score", label: "Overall Score" },
  {
    key: "continuous_improvement_score",
    label: "Commitment to Continuous Improvement",
  },
  {
    key: "continuous_improvement_reason",
    label: "Commitment to Continuous Improvement Justification",
  },
  { key: "collaboration_score", label: "Collaboration & Engagement" },
  {
    key: "collaboration_reason",
    label: "Collaboration & Engagement Justification",
  },
  { key: "innovation_score", label: "Innovation & Creativity" },
  {
    key: "innovation_reason",
    label: "Innovation & Creativity Justification",
  },
  { key: "inclusivity_score", label: "Inclusivity & Equity" },
  {
    key: "inclusivity_reason",
    label: "Inclusivity & Equity Justification",
  },
  { key: "evidence_count", label: "Evidence Count" },
  { key: "evidence_links", label: "Evidence Links from Original Sheet" },
  { key: "evidence_summary", label: "Evidence Summary" },
  { key: "evidences", label: "AI Evidences" },
  { key: "detailed_summary", label: "Detailed Summary" },
];

const WORKBOOK_EXCLUDED_COLUMNS = new Set(["__evaluation_debug"]);
const REVIEW_COLUMN_KEYS = new Set(REVIEW_COLUMNS.map((column) => column.key));

export function orderReviewedRowsForWorkbook(rows) {
  return rows.map((row) => {
    const ordered = {};

    for (const column of REVIEW_COLUMNS) {
      ordered[column.label] = row?.[column.key] ?? "";
    }

    for (const [key, value] of Object.entries(row ?? {})) {
      if (!REVIEW_COLUMN_KEYS.has(key) && !WORKBOOK_EXCLUDED_COLUMNS.has(key)) {
        ordered[key] = value;
      }
    }

    return ordered;
  });
}
