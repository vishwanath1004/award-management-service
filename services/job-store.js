import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const DATA_ROOT = path.resolve(
  process.env.JOB_STORAGE_DIR || path.join(process.cwd(), "data")
);

const JOBS_DIR = path.join(DATA_ROOT, "jobs");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");
export const INCOMING_UPLOAD_DIR = path.join(UPLOADS_DIR, "incoming");

const SCORE_LABELS = {
  1: "Emerging",
  2: "Developing",
  3: "Proficient",
  4: "Exemplary",
};

function jobDir(jobId) {
  return path.join(JOBS_DIR, jobId);
}

function metaPath(jobId) {
  return path.join(jobDir(jobId), "job.json");
}

function resultsPath(jobId) {
  return path.join(jobDir(jobId), "results.json");
}

function outputPath(jobId) {
  return path.join(jobDir(jobId), "reviewed_responses.xlsx");
}

function inputPath(jobId, originalFileName = "") {
  const extension = path.extname(originalFileName).toLowerCase() || ".csv";
  return path.join(jobDir(jobId), `submission${extension}`);
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function formatScoreLabel(score) {
  if (typeof score === "string" && score.includes("=")) {
    const parts = score.split("=");
    return parts[1] ? parts[1].trim() : score;
  }

  const normalized = Number.parseInt(score, 10);
  return SCORE_LABELS[normalized] || (score ?? "");
}

function normalizeReviewedRow(row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  return {
    ...row,
    continuous_improvement_score: formatScoreLabel(
      row.continuous_improvement_score
    ),
    collaboration_score: formatScoreLabel(row.collaboration_score),
    innovation_score: formatScoreLabel(row.innovation_score),
    inclusivity_score: formatScoreLabel(row.inclusivity_score),
  };
}

export async function ensureJobStorage() {
  await Promise.all([
    fs.mkdir(DATA_ROOT, { recursive: true }),
    fs.mkdir(JOBS_DIR, { recursive: true }),
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.mkdir(INCOMING_UPLOAD_DIR, { recursive: true }),
  ]);
}

export function getJobPaths(jobId, originalFileName = "") {
  return {
    jobDir: jobDir(jobId),
    metaPath: metaPath(jobId),
    resultsPath: resultsPath(jobId),
    outputPath: outputPath(jobId),
    inputPath: inputPath(jobId, originalFileName),
  };
}

export async function createJobRecord({
  sourceFileName,
  fileSize,
  mimeType,
}) {
  const jobId = randomUUID();
  const paths = getJobPaths(jobId, sourceFileName);

  await fs.mkdir(paths.jobDir, { recursive: true });

  const now = new Date().toISOString();
  const job = {
    id: jobId,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    status: "queued",
    sourceFileName,
    mimeType,
    fileSize,
    totalRows: 0,
    processedRows: 0,
    evaluatedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    errorMessage: "",
    paths: {
      ...paths,
      inputPath: path.relative(process.cwd(), paths.inputPath),
      resultsPath: path.relative(process.cwd(), paths.resultsPath),
      outputPath: path.relative(process.cwd(), paths.outputPath),
    },
  };

  await writeJson(paths.metaPath, job);
  return job;
}

export async function readJob(jobId) {
  try {
    return await readJson(metaPath(jobId));
  } catch {
    return null;
  }
}

export async function readJobResults(jobId) {
  try {
    const results = await readJson(resultsPath(jobId));
    return Array.isArray(results) ? results.map(normalizeReviewedRow) : [];
  } catch {
    return [];
  }
}

export async function writeJobResults(jobId, results) {
  await writeJson(resultsPath(jobId), results);
}

export async function updateJob(jobId, patch) {
  const existing = await readJob(jobId);

  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    ...patch,
    paths: existing.paths,
    updatedAt: new Date().toISOString(),
  };

  if (patch?.paths) {
    updated.paths = {
      ...existing.paths,
      ...patch.paths,
    };
  }

  await writeJson(metaPath(jobId), updated);
  return updated;
}

export function listJobIds() {
  return fs
    .readdir(JOBS_DIR, { withFileTypes: true })
    .then((entries) =>
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    )
    .catch(() => []);
}

export function resolveJobInputPath(job) {
  return path.resolve(job.paths.inputPath);
}

export function resolveJobOutputPath(job) {
  return path.resolve(job.paths.outputPath);
}

export function resolveJobResultsPath(job) {
  return path.resolve(job.paths.resultsPath);
}
