import fs from "fs";
import fsPromises from "fs/promises";
import csv from "csv-parser";
import path from "path";
import XLSX from "xlsx";
import {
  buildEvaluatedRow,
  buildSkippedRow,
  isSelfNomination,
} from "./nomination-utils.js";
import {
  readJob,
  resolveJobInputPath,
  resolveJobOutputPath,
  updateJob,
  writeJobResults,
} from "./job-store.js";
import { evaluateNomination } from "./evaluator.js";
import { orderReviewedRowsForWorkbook } from "./review-columns.js";

const DEFAULT_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.AI_CONCURRENCY || "3", 10) || 3
);

const MAX_ROWS_PER_JOB = Math.max(
  1,
  Number.parseInt(process.env.MAX_ROWS_PER_JOB || "1000", 10) || 1000
);

const activeJobs = new Set();

function readCsvRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("error", reject)
      .on("end", () => resolve(rows));
  });
}

async function saveWorkbook(rows, filePath) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    orderReviewedRowsForWorkbook(rows)
  );

  XLSX.utils.book_append_sheet(workbook, worksheet, "Reviewed Responses");
  XLSX.writeFile(workbook, filePath);
}

function logSkippedRow(row, selfNominationInfo, rowNumber) {
  const rowLabel = rowNumber ? `Row ${rowNumber}` : "Row";

  console.log(`\n========== ROW SKIPPED BEFORE AI (${rowLabel}) ==========`);
  console.log("Serialized row content:");
  console.log(JSON.stringify(row));
  console.log("Skip reason:");
  console.log(selfNominationInfo.reason || "Self nomination detected");
  console.log(`========== ROW SKIPPED END (${rowLabel}) ==========\n`);
}

function buildSkippedDebug(row, selfNominationInfo, rowNumber) {
  return {
    rowNumber: rowNumber || "",
    status: "skipped_before_ai",
    rowContent: JSON.stringify(row),
    skipReason: selfNominationInfo.reason || "Self nomination detected",
    systemPrompt: "",
    userPrompt: "No AI prompt was created because this row was skipped before AI evaluation.",
  };
}

async function processRow(row, rowNumber) {
  const selfNominationInfo = isSelfNomination(row);

  if (selfNominationInfo.detected) {
    logSkippedRow(row, selfNominationInfo, rowNumber);

    return {
      row: {
        ...buildSkippedRow(row, selfNominationInfo),
        __evaluation_debug: buildSkippedDebug(row, selfNominationInfo, rowNumber),
      },
      status: "skipped",
    };
  }

  const aiReview = await evaluateNomination(row, { rowNumber });

  return {
    row: {
      ...buildEvaluatedRow(row, aiReview),
      __evaluation_debug: aiReview.__evaluation_debug,
    },
    status: "evaluated",
  };
}

async function runBatch(rows, startIndex) {
  return Promise.all(
    rows.map((row, rowIndex) => processRow(row, startIndex + rowIndex + 1))
  );
}

export async function startJobProcessing(jobId) {
  if (activeJobs.has(jobId)) {
    return;
  }

  activeJobs.add(jobId);

  try {
    await processJob(jobId);
  } finally {
    activeJobs.delete(jobId);
  }
}

export async function resumeIncompleteJobs() {
  const dataRoot = path.resolve(process.env.JOB_STORAGE_DIR || path.join(process.cwd(), "data"));
  const jobsDir = path.join(dataRoot, "jobs");

  try {
    const entries = await fsPromises.readdir(jobsDir, { withFileTypes: true });
    const jobIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    await Promise.all(
      jobIds.map(async (jobId) => {
        const job = await readJob(jobId);
        if (!job) {
          return;
        }

        if (job.status === "queued" || job.status === "running") {
          void startJobProcessing(jobId);
        }
      })
    );
  } catch {
    return;
  }
}

export async function processJob(jobId) {
  const job = await readJob(jobId);

  if (!job) {
    return;
  }

  if (job.status === "completed") {
    return;
  }

  const inputPath = resolveJobInputPath(job);
  const outputPath = resolveJobOutputPath(job);

  if (!fs.existsSync(inputPath)) {
    await updateJob(jobId, {
      status: "failed",
      errorMessage: "Uploaded CSV file could not be found on disk.",
      completedAt: new Date().toISOString(),
    });
    return;
  }

  await updateJob(jobId, {
    status: "running",
    startedAt: job.startedAt || new Date().toISOString(),
    errorMessage: "",
  });

  try {
    const rows = await readCsvRows(inputPath);

    if (rows.length === 0) {
      throw new Error("The uploaded CSV did not contain any rows.");
    }

    if (rows.length > MAX_ROWS_PER_JOB) {
      throw new Error(
        `This upload has ${rows.length} rows, which exceeds the configured limit of ${MAX_ROWS_PER_JOB}.`
      );
    }

    const reviewedRows = [];
    let processedRows = 0;
    let evaluatedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    for (let index = 0; index < rows.length; index += DEFAULT_CONCURRENCY) {
      const batch = rows.slice(index, index + DEFAULT_CONCURRENCY);
      const batchResults = await runBatch(batch, index);

      for (const result of batchResults) {
        reviewedRows.push(result.row);

        if (result.status === "skipped") {
          skippedRows += 1;
        } else if (result.status === "evaluated") {
          evaluatedRows += 1;
        } else {
          failedRows += 1;
        }

        processedRows += 1;
      }

      await writeJobResults(jobId, reviewedRows);
      await updateJob(jobId, {
        totalRows: rows.length,
        processedRows,
        evaluatedRows,
        skippedRows,
        failedRows,
      });
    }

    const scoredRows = reviewedRows.filter(
      (row) => row.evaluation_status === "Evaluated"
    );
    const skipped = reviewedRows.filter(
      (row) => row.evaluation_status !== "Evaluated"
    );

    scoredRows.sort((a, b) => Number(b.overall_score) - Number(a.overall_score));

    const finalRows = [...scoredRows, ...skipped];

    await writeJobResults(jobId, finalRows);
    await saveWorkbook(finalRows, outputPath);

    await updateJob(jobId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      totalRows: rows.length,
      processedRows: rows.length,
      evaluatedRows,
      skippedRows,
      failedRows,
    });
  } catch (error) {
    await updateJob(jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage: error.message,
    });
  }
}
