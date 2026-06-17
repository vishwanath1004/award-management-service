# AI Evaluation Application

This app accepts a CSV of nominations, evaluates each row with OpenAI, stores each job on disk, and returns a reviewed Excel workbook plus JSON results.

## Architecture

```text
User uploads CSV
  -> React frontend
  -> POST /upload
  -> backend saves file and creates a job record
  -> background worker reads rows
  -> each row is checked for self-nomination
  -> non-skipped rows are sent to OpenAI one at a time in controlled batches
  -> AI returns structured JSON scores, evidence, and summary
  -> backend writes per-job results and an Excel file
  -> frontend polls job status and downloads the workbook when ready
```

## AI Model

The backend uses `gpt-4o-mini` by default. You can override it with `OPENAI_MODEL`.

## Storage

- Uploaded CSV files are stored under `backend/data/jobs/<jobId>/`
- Reviewed rows are stored as JSON per job
- The reviewed Excel file is stored per job as `reviewed_responses.xlsx`
- There is no external database in this repo

## API

- `POST /upload` creates a job and starts processing
- `GET /jobs/:jobId` returns job status and progress
- `GET /jobs/:jobId/results` returns reviewed rows
- `GET /jobs/:jobId/download` returns the reviewed workbook
- `GET /health` returns a basic health check

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Set your OpenAI key and any optional environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `PORT`
- `CORS_ORIGIN`
- `MAX_UPLOAD_SIZE`
- `MAX_ROWS_PER_JOB`
- `AI_CONCURRENCY`
- `JOB_STORAGE_DIR`

Start the backend:

```bash
npm start
```

## Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` if the backend is not running on `http://localhost:5008`.

## Local URLs

- Backend: `http://localhost:5008`
- Frontend: `http://localhost:5173`
