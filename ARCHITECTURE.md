# AI Evaluation Application Architecture

## 1. Purpose

This application automates the review of nomination-style CSV submissions using OpenAI. A user uploads a CSV file through the frontend, the backend creates a processing job, each row is evaluated against a fixed rubric, and the final reviewed output is stored as both JSON and an Excel workbook.

The design goal is to make the review workflow repeatable, traceable, and easy to operate for batch submissions while keeping the AI interaction structured and predictable.

## 2. Business Problem

The project solves a manual review problem:

- nominations arrive in CSV format
- each row represents one submission
- reviewers need consistent scoring
- evidence and summary text must be extracted
- results should be downloadable as a reviewed spreadsheet

Instead of reviewing every submission by hand, the application delegates scoring and summarization to OpenAI using a fixed rubric.

## 3. High-Level System View

```text
User
  -> React Frontend
  -> POST /upload
  -> Backend API
  -> Job record created on disk
  -> Background processor starts
  -> CSV rows parsed
  -> Each row checked for self-nomination
  -> Eligible rows sent to OpenAI
  -> AI returns structured JSON
  -> Backend normalizes and stores results
  -> Excel workbook generated
  -> Frontend polls job status
  -> User downloads reviewed workbook
```

## 4. Core Components

### 4.1 Frontend

Location: `frontend/src/App.jsx`

Responsibilities:

- accept CSV file uploads
- send the file to the backend
- display job status and progress
- poll the backend until processing completes
- render reviewed rows in a table
- provide the final workbook download link

The frontend does not do any AI work and does not store results permanently. It acts as the user interface and job monitor.

### 4.2 Backend API

Location: `backend/index.js`

Responsibilities:

- receive uploads
- validate file type and size
- create a unique job for every submission
- expose job status, results, and download endpoints
- return immediate acknowledgment for upload requests
- coordinate the background processing workflow

The backend is the orchestration layer. It owns upload handling, API responses, and the relationship between the raw CSV and the evaluated output.

### 4.3 Job Store

Location: `backend/services/job-store.js`

Responsibilities:

- create job directories
- persist job metadata
- persist row-level reviewed results
- resolve file paths for input and output artifacts
- support recovery if the server restarts

Storage is file-based, not database-based. Every job gets its own folder under `backend/data/jobs/<jobId>/`.

### 4.4 Job Processor

Location: `backend/services/job-processor.js`

Responsibilities:

- read the CSV rows
- process rows in controlled batches
- detect and skip self-nominations
- call the AI evaluator for eligible rows
- update progress after each batch
- write the reviewed Excel workbook
- mark the job completed or failed

This is the engine of the system. It is intentionally separated from the API so the upload request does not remain open for the full duration of AI processing.

### 4.5 AI Evaluator

Location: `backend/services/evaluator.js`

Responsibilities:

- send a single CSV row to OpenAI
- ask for structured JSON output
- enforce the evaluation rubric
- normalize the model response
- compute the final overall score from the four category scores
- handle retries and fallback behavior

The model used is configurable through `OPENAI_MODEL` and defaults to `gpt-4o-mini`.

### 4.6 Nomination Utilities

Location: `backend/services/nomination-utils.js`

Responsibilities:

- extract nominee and nominator fields from different CSV column variants
- detect self-nominations
- build the final reviewed row for evaluated submissions
- build the final reviewed row for skipped submissions

This module is the business rule layer for row classification and row shaping.

## 5. End-to-End Request Flow

### 5.1 Upload

1. The user selects a CSV file in the frontend.
2. The frontend sends the file to `POST /upload`.
3. Multer stores the file temporarily in the incoming upload directory.
4. The backend creates a new job record and assigns a unique `jobId`.
5. The uploaded file is moved into the job folder.
6. The backend returns `202 Accepted` with the job metadata and polling URLs.

### 5.2 Background Processing

1. The job processor loads the CSV from the job folder.
2. The processor parses the CSV into row objects.
3. Rows are processed in batches controlled by `AI_CONCURRENCY`.
4. Before calling AI, each row is checked for self-nomination.
5. Self-nominations are skipped and marked as such.
6. Eligible rows are sent one by one to the evaluator inside the batch.
7. The evaluator calls OpenAI and returns normalized JSON.
8. The backend merges AI output with the original row.
9. Progress is written back to the job record after each batch.
10. Once all rows are complete, the backend sorts the evaluated rows by `overall_score`.
11. The reviewed rows are written to `results.json`.
12. The reviewed workbook is written to `reviewed_responses.xlsx`.
13. The job is marked `completed`.

### 5.3 Frontend Polling

1. The frontend stores the returned `jobId`.
2. It polls `GET /jobs/:jobId` every few seconds.
3. While the job is `queued` or `running`, progress is updated in the UI.
4. When the job becomes `completed`, the frontend fetches `GET /jobs/:jobId/results`.
5. The reviewed table is rendered.
6. The user can download the Excel workbook from `GET /jobs/:jobId/download`.

## 6. AI Processing Design

The AI is used as a rubric-based evaluator, not as a training system.

### 6.1 Input to the Model

For each eligible row, the backend sends the row as serialized JSON. The row may include:

- nominee name
- nominee contact data
- nominator information
- free-text nomination fields
- evidence links or file references

### 6.2 Prompt Structure

The evaluator instructs the model to:

- score four criteria:
  - Commitment to Continuous Improvement
  - Collaboration & Engagement
  - Innovation & Creativity
  - Inclusivity & Equity
- return only valid JSON
- provide reasons for each score
- provide a summary for judges
- return evidence items as a list

The system prompt also includes explicit definitions and score anchors for each criterion so the model does not infer meaning from the labels alone.

### 6.3 Scoring Output

The model returns a JSON object with:

- `continuous_improvement.score`
- `collaboration.score`
- `innovation.score`
- `inclusivity.score`
- `evidences`
- `detailed_summary`

The backend then:

- clamps scores to the expected range
- computes `overall_score` from the four category scores
- counts evidences
- stores the normalized result

This means the backend, not the model, owns the final score calculation.

### 6.4 Reliability Controls

The evaluator includes:

- response format enforcement with JSON mode
- retry logic controlled by `OPENAI_RETRIES`
- normalization of malformed or partial responses
- fallback output if evaluation fails

## 7. Data Storage Design

The application does not use an external database in the current implementation. It uses file-based storage on disk.

### 7.1 Per-Job Folder

Each upload receives a dedicated directory:

```text
backend/data/jobs/<jobId>/
```

Typical contents:

- `job.json` - job metadata and status
- `submission.csv` - original uploaded file copied into the job folder
- `results.json` - reviewed rows in JSON form
- `reviewed_responses.xlsx` - final downloadable workbook

### 7.2 What Is Persisted

Persisted:

- job ID
- timestamps
- status
- source filename
- file size
- processing counts
- error message if failed
- reviewed rows
- final Excel workbook

Not persisted:

- user accounts
- authentication state
- long-term searchable submission history in a database
- vector embeddings
- model conversations beyond the structured review output

## 8. API Contract

### 8.1 `GET /health`

Purpose:

- basic health check for deployment and monitoring

Response:

```json
{
  "success": true,
  "status": "ok"
}
```

### 8.2 `POST /upload`

Purpose:

- accept a CSV upload
- create a job
- start background processing

Response:

```json
{
  "success": true,
  "jobId": "uuid",
  "status": "queued",
  "statusUrl": "/jobs/:jobId",
  "resultsUrl": "/jobs/:jobId/results",
  "downloadUrl": "/jobs/:jobId/download"
}
```

### 8.3 `GET /jobs/:jobId`

Purpose:

- return job metadata and progress

### 8.4 `GET /jobs/:jobId/results`

Purpose:

- return reviewed rows for display

### 8.5 `GET /jobs/:jobId/download`

Purpose:

- download the generated Excel workbook

## 9. Job Lifecycle

Job states:

- `queued` - upload accepted, processing not yet finished
- `running` - worker is actively processing rows
- `completed` - all rows processed and workbook generated
- `failed` - the job could not be completed

Progress fields:

- `totalRows`
- `processedRows`
- `evaluatedRows`
- `skippedRows`
- `failedRows`

This gives the frontend and operators a simple operational view of the work in progress.

## 10. Self-Nomination Handling

Before AI evaluation, each row is checked for self-nomination using heuristic field matching.

The detection logic looks for:

- explicit self-nomination flags
- matching nominee and nominator names
- matching nominee and nominator email addresses
- matching phone numbers
- precomputed match columns when present

If a row is detected as a self-nomination:

- it is skipped
- it is not sent to OpenAI
- it is still stored in the results
- the reviewed workbook records that it was skipped

This saves cost and avoids unnecessary AI calls on rows that are already disqualified by business rules.

## 11. Batching and Concurrency

The job processor does not fire unlimited parallel AI requests.

Instead:

- it reads rows from the CSV
- it slices rows into batches
- each batch is processed with a configured concurrency level
- `AI_CONCURRENCY` controls how many rows are evaluated at once

This gives a balance between:

- speed
- API cost
- rate-limit safety
- server resource stability

## 12. Error Handling Strategy

### 12.1 Upload Errors

Handled cases:

- missing file
- invalid file type
- file too large

### 12.2 Processing Errors

Handled cases:

- malformed CSV
- missing input file
- AI evaluation failure
- JSON parse failure
- empty CSV
- row limit exceeded

### 12.3 AI Failure Behavior

If OpenAI fails after retries:

- the evaluator returns a normalized fallback review
- the overall job can still complete unless the failure is systemic
- the job metadata captures the failure context

## 13. Configuration

Environment variables:

- `OPENAI_API_KEY` - required OpenAI credential
- `OPENAI_MODEL` - AI model name, defaults to `gpt-4o-mini`
- `OPENAI_RETRIES` - retry count for model calls
- `PORT` - backend port, defaults to `5008`
- `CORS_ORIGIN` - allowed frontend origin
- `MAX_UPLOAD_SIZE` - upload size limit
- `MAX_ROWS_PER_JOB` - maximum rows allowed per submission
- `AI_CONCURRENCY` - batch concurrency for row evaluation
- `JOB_STORAGE_DIR` - root directory for persistent job files
- `VITE_API_BASE_URL` - frontend backend URL

## 14. Security and Operational Notes

Current protections:

- CSV-only file filter
- upload size limit
- CORS origin restriction
- per-job file isolation
- no secret values returned in API responses

Recommended next steps for a full production deployment:

- add authentication and authorization
- move from file storage to a database and object storage
- add rate limiting per user or per tenant
- move job processing to a queue worker
- add audit logging
- add observability and alerting
- rotate and manage secrets outside the repository

## 15. Current Architecture Strengths

- simple, understandable flow
- clean separation between upload, processing, and results
- per-job persistence instead of one shared output file
- cost control through self-nomination skipping
- structured AI output, which reduces downstream parsing risk
- frontend no longer blocks on a long request

## 16. Current Tradeoffs

- disk-based storage is not ideal for multi-instance scaling
- jobs are processed inside the backend process rather than a separate queue worker
- there is no identity layer or submission ownership model
- long-running jobs are durable enough for a single-node deployment, but not ideal for horizontally scaled infra without extra work

## 17. Architecture Summary for Leadership

This system is a batch AI review platform. It takes CSV submissions, creates a persistent job for each upload, evaluates each row with OpenAI using a rubric, skips self-nominations through deterministic rules, stores outputs per job, and generates a downloadable reviewed workbook. The frontend is a thin polling client, the backend is the orchestration layer, and the AI model is used as a structured scorer and summarizer rather than a free-form chatbot.

In practical terms, the design reduces manual review time, keeps scoring consistent, and gives the team a repeatable review workflow with clear status visibility.
