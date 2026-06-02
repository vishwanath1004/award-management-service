const NAME_PREFIXES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "professor",
  "shri",
  "sri",
  "smt",
  "kumari",
  "kum",
  "md",
]);

const TRUTHY_VALUES = new Set([
  "yes",
  "y",
  "true",
  "1",
  "self",
  "self nomination",
  "self-nomination",
]);

const NOMINEE_NAME_KEYS = [
  "Full Name of the Person Being Nominated:",
  "Nominee Name",
  "Name",
  "Full Name",
  "Applicant Name",
];

const NOMINEE_CONTACT_KEYS = [
  "Contact Information of the Person Being Nominated (Phone and/or Email Address):",
  "Nominee Contact",
  "Nominee Contact Information",
  "Contact Information of the Person Being Nominated",
  "Contact Number of the Person Being Nominated",
  "Phone Number of the Person Being Nominated",
  "Email Address of the Person Being Nominated",
];

const NOMINEE_EMAIL_KEYS = [
  "Nominee Email",
  "Email Address of the Person Being Nominated",
  "Person Being Nominated Email",
  "Email",
];

const NOMINEE_PHONE_KEYS = [
  "Nominee Phone",
  "Phone Number of the Person Being Nominated",
  "Contact Number of the Person Being Nominated",
  "Mobile Number of the Person Being Nominated",
  "Mobile",
];

const NOMINATOR_NAME_KEYS = [
  "Your Full Name:",
  "Nominator Name",
  "Your Name",
  "Submitted By",
];

const NOMINATOR_EMAIL_KEYS = [
  "Your Email Address:",
  "Nominator Email",
  "Email Address",
  "Email",
];

const NOMINATOR_PHONE_KEYS = [
  "Your Phone Number:",
  "Nominator Phone",
  "Phone Number",
  "Mobile Number",
  "Mobile",
];

const SELF_NOMINATION_KEYS = [
  "Self-Nomination",
  "Self Nomination",
  "Self nomination",
];

const NAME_MATCH_KEYS = ["Name is Same", "Name Same"];
const EMAIL_MATCH_KEYS = ["Email iD is Same", "Email ID is Same", "Email is Same"];

const SCORE_LABELS = {
  1: "Emerging",
  2: "Developing",
  3: "Proficient",
  4: "Exemplary",
};

function normalizeKey(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function getField(row, keys) {
  const normalizedRow = Object.entries(row ?? {}).reduce((fields, [key, value]) => {
    fields[normalizeKey(key)] = value;
    return fields;
  }, {});

  for (const key of keys) {
    const value = normalizedRow[normalizeKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  const tokens = normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !NAME_PREFIXES.has(token));

  return tokens.join(" ");
}

function extractEmail(value) {
  const match = String(value ?? "").match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
  );

  return match ? match[0].toLowerCase() : "";
}

function extractPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length < 7) {
    return "";
  }

  return digits;
}

function isTruthyFlag(value) {
  const normalized = normalizeText(value);
  return TRUTHY_VALUES.has(normalized);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function formatScoreLabel(score) {
  if (typeof score === "string") {
    const parts = score.split("=");
    if (parts.length > 1) {
      return parts[1].trim();
    }
  }

  const normalized = Number.parseInt(score, 10);
  return SCORE_LABELS[normalized] || "";
}

function getNomineeDetails(row) {
  const nomineeName = getField(row, NOMINEE_NAME_KEYS);
  const nomineeContact = getField(row, NOMINEE_CONTACT_KEYS);
  const nomineeEmail = firstNonEmpty(
    extractEmail(nomineeContact),
    getField(row, NOMINEE_EMAIL_KEYS)
  );
  const nomineePhone = firstNonEmpty(
    extractPhone(nomineeContact),
    getField(row, NOMINEE_PHONE_KEYS)
  );

  return {
    name: nomineeName,
    normalizedName: normalizeName(nomineeName),
    email: nomineeEmail,
    phone: nomineePhone,
  };
}

function getNominatorDetails(row) {
  const nominatorName = getField(row, NOMINATOR_NAME_KEYS);
  const nominatorEmail = getField(row, NOMINATOR_EMAIL_KEYS);
  const nominatorPhone = getField(row, NOMINATOR_PHONE_KEYS);

  return {
    name: nominatorName,
    normalizedName: normalizeName(nominatorName),
    email: extractEmail(nominatorEmail),
    phone: extractPhone(nominatorPhone),
  };
}

export function isSelfNomination(row) {
  const nominee = getNomineeDetails(row);
  const nominator = getNominatorDetails(row);

  const explicitSelfNomination = SELF_NOMINATION_KEYS.some((key) =>
    isTruthyFlag(getField(row, [key]))
  );

  const nameMatches = nominee.normalizedName && nominee.normalizedName === nominator.normalizedName;
  const emailMatches = nominee.email && nominator.email && nominee.email === nominator.email;
  const phoneMatches = nominee.phone && nominator.phone && nominee.phone === nominator.phone;
  const precomputedNameMatch = NAME_MATCH_KEYS.some((key) =>
    isTruthyFlag(getField(row, [key]))
  );
  const precomputedEmailMatch = EMAIL_MATCH_KEYS.some((key) =>
    isTruthyFlag(getField(row, [key]))
  );

  const inferredSelfNomination =
    (nameMatches && (emailMatches || phoneMatches)) || (emailMatches && phoneMatches);

  const detected = explicitSelfNomination || precomputedNameMatch || precomputedEmailMatch || inferredSelfNomination;

  const reasonParts = [];

  if (explicitSelfNomination) {
    reasonParts.push("explicit self-nomination flag");
  }

  if (precomputedNameMatch) {
    reasonParts.push("name matched");
  }

  if (precomputedEmailMatch) {
    reasonParts.push("email matched");
  }

  if (nameMatches && (emailMatches || phoneMatches)) {
    reasonParts.push("nominee and nominator matched by name plus contact");
  } else if (emailMatches && phoneMatches) {
    reasonParts.push("nominee and nominator matched by email and phone");
  }

  return {
    detected,
    reason: reasonParts.length > 0 ? reasonParts.join("; ") : "",
    nominee,
    nominator,
  };
}

export function buildSkippedRow(row, selfNominationInfo) {
  const skippedReason = selfNominationInfo.reason || "Self nomination detected";

  return {
    ...row,
    nominee_name: selfNominationInfo.nominee.name || "Unknown",
    evaluation_status: "Self nomination - skipped",
    self_nomination_detected: "Yes",
    self_nomination_reason: selfNominationInfo.reason,
    continuous_improvement_score: "Not rated",
    continuous_improvement_reason: skippedReason,
    collaboration_score: "Not rated",
    collaboration_reason: skippedReason,
    innovation_score: "Not rated",
    innovation_reason: skippedReason,
    inclusivity_score: "Not rated",
    inclusivity_reason: skippedReason,
    overall_score: "Not rated",
    evidence_count: "Not rated",
    evidences: "",
    detailed_summary: "Skipped because this row was detected as a self nomination.",
  };
}

export function buildEvaluatedRow(row, aiReview) {
  return {
    ...row,
    nominee_name: getField(row, NOMINEE_NAME_KEYS) || "Unknown",
    evaluation_status: "Evaluated",
    self_nomination_detected: "No",
    self_nomination_reason: "",
    continuous_improvement_score: formatScoreLabel(
      aiReview.continuous_improvement.score
    ),
    continuous_improvement_reason: aiReview.continuous_improvement.reason,
    collaboration_score: formatScoreLabel(aiReview.collaboration.score),
    collaboration_reason: aiReview.collaboration.reason,
    innovation_score: formatScoreLabel(aiReview.innovation.score),
    innovation_reason: aiReview.innovation.reason,
    inclusivity_score: formatScoreLabel(aiReview.inclusivity.score),
    inclusivity_reason: aiReview.inclusivity.reason,
    overall_score: aiReview.overall_score,
    evidence_count: aiReview.evidence_count,
    evidences: Array.isArray(aiReview.evidences) ? aiReview.evidences.join(", ") : "",
    detailed_summary: aiReview.detailed_summary,
  };
}
