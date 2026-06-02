export const REVIEW_COLUMNS = [
  "nominee_name",
  "evaluation_status",
  "self_nomination_detected",
  "self_nomination_reason",
  "overall_score",
  "continuous_improvement_score",
  "continuous_improvement_reason",
  "collaboration_score",
  "collaboration_reason",
  "innovation_score",
  "innovation_reason",
  "inclusivity_score",
  "inclusivity_reason",
  "evidence_count",
  "evidences",
  "detailed_summary",
];

const WORKBOOK_EXCLUDED_COLUMNS = new Set(["__evaluation_debug"]);

export function orderReviewedRowsForWorkbook(rows) {
  return rows.map((row) => {
    const ordered = {};

    for (const column of REVIEW_COLUMNS) {
      ordered[column] = row?.[column] ?? "";
    }

    for (const [key, value] of Object.entries(row ?? {})) {
      if (!REVIEW_COLUMNS.includes(key) && !WORKBOOK_EXCLUDED_COLUMNS.has(key)) {
        ordered[key] = value;
      }
    }

    return ordered;
  });
}
