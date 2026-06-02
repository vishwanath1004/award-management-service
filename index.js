import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import XLSX from "xlsx";
import {
  createJobRecord,
  ensureJobStorage,
  INCOMING_UPLOAD_DIR,
  readJob,
  readJobResults,
  resolveJobOutputPath,
  updateJob,
} from "./services/job-store.js";
import {
  resumeIncompleteJobs,
  startJobProcessing,
} from "./services/job-processor.js";
import { orderReviewedRowsForWorkbook } from "./services/review-columns.js";

dotenv.config();

function parseByteSize(value, fallbackBytes) {
  if (!value) {
    return fallbackBytes;
  }

  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);

  if (!match) {
    return fallbackBytes;
  }

  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] || "b").toLowerCase();
  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  return Math.max(1, Math.floor(amount * multipliers[unit]));
}

const PORT = Number.parseInt(process.env.PORT || "5008", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const MAX_UPLOAD_SIZE = parseByteSize(process.env.MAX_UPLOAD_SIZE, 10 * 1024 * 1024);

await ensureJobStorage();

const app = express();

app.set("trust proxy", 1);
app.use(
  cors({
    origin: CORS_ORIGIN,
  })
);
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  dest: INCOMING_UPLOAD_DIR,
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();

    if (extension !== ".csv") {
      callback(new Error("Only CSV files are allowed."));
      return;
    }

    callback(null, true);
  },
});

function sanitizeJob(job) {
  if (!job) {
    return null;
  }

  const { paths, ...rest } = job;
  return rest;
}

async function writeWorkbookFromRows(rows, filePath) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    orderReviewedRowsForWorkbook(rows)
  );

  XLSX.utils.book_append_sheet(workbook, worksheet, "Reviewed Responses");
  XLSX.writeFile(workbook, filePath);
}

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
  });
});

app.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Please upload a CSV file.",
      });
    }

    const job = await createJobRecord({
      sourceFileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    await fs.rename(req.file.path, job.paths.inputPath);

    await updateJob(job.id, {
      status: "queued",
    });

    void startJobProcessing(job.id);

    return res.status(202).json({
      success: true,
      jobId: job.id,
      status: "queued",
      statusUrl: `/jobs/${job.id}`,
      resultsUrl: `/jobs/${job.id}/results`,
      downloadUrl: `/jobs/${job.id}/download`,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/jobs/:jobId", async (req, res) => {
  const job = await readJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: "Job not found.",
    });
  }

  return res.json({
    success: true,
    job: sanitizeJob(job),
  });
});

app.get("/jobs/:jobId/results", async (req, res) => {
  const job = await readJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: "Job not found.",
    });
  }

  const reviewed = await readJobResults(req.params.jobId);

  return res.json({
    success: true,
    jobId: job.id,
    status: job.status,
    reviewed,
  });
});

app.get("/jobs/:jobId/download", async (req, res) => {
  const job = await readJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: "Job not found.",
    });
  }

  if (job.status !== "completed") {
    return res.status(409).json({
      success: false,
      error: "The reviewed spreadsheet is not ready yet.",
    });
  }

  const outputPath = resolveJobOutputPath(job);
  const reviewed = await readJobResults(req.params.jobId);

  if (!reviewed.length) {
    return res.status(404).json({
      success: false,
      error: "The reviewed spreadsheet is missing.",
    });
  }

  await writeWorkbookFromRows(reviewed, outputPath);

  return res.download(outputPath, `reviewed_responses_${job.id}.xlsx`);
});

app.use((error, _req, res, _next) => {
  let statusCode = 500;

  if (error.message === "Only CSV files are allowed.") {
    statusCode = 400;
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
  }

  return res.status(statusCode).json({
    success: false,
    error: error.message || "Unexpected server error.",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

void resumeIncompleteJobs();
