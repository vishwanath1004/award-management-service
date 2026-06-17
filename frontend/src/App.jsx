import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5008";

const STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

const REVIEW_COLUMNS = [
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

const REVIEW_COLUMN_KEYS = new Set(REVIEW_COLUMNS.map((column) => column.key));
const INTERNAL_EXCLUDED_COLUMNS = new Set(["__evaluation_debug"]);
const styles = {
  page: {
    fontFamily: "Arial, sans-serif",
    padding: 24,
    color: "#111827",
    background:
      "linear-gradient(180deg, #eef2ff 0%, #f8fafc 35%, #f3f4f6 100%)",
    minHeight: "100vh",
  },
  shell: {
    maxWidth: 1200,
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.06)",
  },
  header: {
    marginBottom: 20,
  },
  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12,
  },
  button: {
    padding: "10px 16px",
    borderRadius: 6,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  muted: {
    color: "#6b7280",
    fontSize: 14,
  },
  note: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.5,
  },
  tabs: {
    display: "inline-flex",
    gap: 8,
    padding: 4,
    borderRadius: 999,
    background: "#e2e8f0",
    marginBottom: 18,
  },
  tabButton: {
    border: 0,
    background: "transparent",
    padding: "10px 16px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 700,
    color: "#475569",
  },
  tabButtonActive: {
    background: "#0f172a",
    color: "#fff",
    boxShadow: "0 10px 20px rgba(15, 23, 42, 0.18)",
  },
  panel: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    background: "#fafafa",
  },
  tableWrap: {
    marginTop: 20,
    overflowX: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#fff",
    tableLayout: "fixed",
  },
  th: {
    textAlign: "left",
    padding: 12,
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    whiteSpace: "normal",
    verticalAlign: "top",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    fontSize: 14,
  },
  td: {
    padding: 12,
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
    fontSize: 14,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  tag: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#e5e7eb",
    fontSize: 12,
    fontWeight: 700,
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    background: "#e5e7eb",
    overflow: "hidden",
    marginTop: 8,
  },
  progressBar: {
    height: "100%",
    background: "#2563eb",
  },
  translateDrop: {
    marginTop: 16,
    border: "1px dashed #cbd5e1",
    borderRadius: 12,
    padding: 16,
    background: "#f8fafc",
  },
  downloadButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    padding: "10px 16px",
    borderRadius: 6,
    border: "1px solid #059669",
    background: "#059669",
    color: "#fff",
    fontWeight: 700,
  },
};

function formatCellValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function getOriginalColumns(reviewedRows) {
  if (!Array.isArray(reviewedRows) || reviewedRows.length === 0) {
    return [];
  }

  return Object.keys(reviewedRows[0]).filter(
    (key) => !REVIEW_COLUMN_KEYS.has(key) && !INTERNAL_EXCLUDED_COLUMNS.has(key)
  );
}

function getColumnWidth(column) {
  const widths = {
    nominee_name: 180,
    evaluation_status: 140,
    self_nomination_detected: 130,
    self_nomination_reason: 260,
    strict_validation_notes: 300,
    overall_score: 110,
    continuous_improvement_score: 180,
    continuous_improvement_reason: 260,
    collaboration_score: 170,
    collaboration_reason: 260,
    innovation_score: 160,
    innovation_reason: 260,
    inclusivity_score: 160,
    inclusivity_reason: 260,
    evidence_count: 120,
    evidence_links: 280,
    evidence_summary: 280,
    evidences: 280,
    detailed_summary: 320,
  };

  return widths[column.key] || 180;
}

function buildTranslatedDownloadName(fileName) {
  if (!fileName) {
    return "translated_for_evaluation.csv";
  }

  const baseName = String(fileName).replace(/\.csv$/i, "");
  return `${baseName}_translated_en.csv`;
}

function formatProgress(job) {
  if (!job?.totalRows) {
    return "0 / 0";
  }

  return `${job.processedRows || 0} / ${job.totalRows}`;
}

function logEvaluationDebug(jobId, reviewedRows) {
  if (!Array.isArray(reviewedRows) || reviewedRows.length === 0) {
    return;
  }

  console.log(
    `========== AI EVALUATION DEBUG START | Job ${jobId} | ${reviewedRows.length} rows ==========`
  );

  reviewedRows.forEach((row, index) => {
    const debug = row.__evaluation_debug;
    const rowNumber = debug?.rowNumber || index + 1;
    const nominee = row.nominee_name || "Unknown nominee";

    console.log(`========== ROW ${rowNumber}: ${nominee} ==========`);
    console.log("Evaluation status:", row.evaluation_status || "");
    console.log("Serialized row content:", debug?.rowContent || JSON.stringify(row));

    if (debug?.status === "skipped_before_ai") {
      console.log("Skip reason:", debug.skipReason || "Self nomination detected");
      console.log("Prompt:", debug.userPrompt || "No AI prompt was created.");
    } else {
      console.log("System prompt:", debug?.systemPrompt || "");
      console.log("User prompt:", debug?.userPrompt || "");
    }

    console.log(`========== ROW ${rowNumber} END ==========`);
  });

  console.log(`========== AI EVALUATION DEBUG END | Job ${jobId} ==========`);
}

function EvaluatePanel({
  setFile,
  uploading,
  uploadFile,
  job,
  reviewed,
  error,
  downloadUrl,
}) {
  const jobStatus = job?.status ? STATUS_LABELS[job.status] || job.status : "";
  const progressPercent =
    job?.totalRows && job.totalRows > 0
      ? Math.min(100, Math.round(((job.processedRows || 0) / job.totalRows) * 100))
      : 0;
  const originalColumns = useMemo(() => getOriginalColumns(reviewed), [reviewed]);
  const tableColumns = useMemo(
    () => [
      ...REVIEW_COLUMNS,
      ...originalColumns.map((key) => ({ key, label: key })),
    ],
    [originalColumns]
  );

  return (
    <>
      <div style={styles.row}>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files[0] || null)}
        />

        <button onClick={uploadFile} style={styles.button} disabled={uploading}>
          {uploading ? "Processing..." : "Upload CSV"}
        </button>

        {job?.id && job.status === "completed" && (
          <a href={downloadUrl} target="_blank" rel="noreferrer">
            Download workbook
          </a>
        )}
      </div>

      {error && (
        <div
          style={{
            ...styles.panel,
            borderColor: "#fecaca",
            background: "#fef2f2",
          }}
        >
          {error}
        </div>
      )}

      {job?.id && (
        <div style={styles.panel}>
          <div style={styles.row}>
            <strong>Job ID:</strong>
            <span style={styles.tag}>{job.id}</span>
            {jobStatus && <span style={styles.tag}>{jobStatus}</span>}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={styles.muted}>Progress: {formatProgress(job)}</div>
            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressBar,
                  width: `${progressPercent}%`,
                }}
              />
            </div>
          </div>

          <div style={{ ...styles.row, marginTop: 16 }}>
            <div>
              <div style={styles.muted}>Evaluated rows</div>
              <strong>{job.evaluatedRows || 0}</strong>
            </div>
            <div>
              <div style={styles.muted}>Skipped rows</div>
              <strong>{job.skippedRows || 0}</strong>
            </div>
            <div>
              <div style={styles.muted}>Failed rows</div>
              <strong>{job.failedRows || 0}</strong>
            </div>
          </div>

          {job.errorMessage && (
            <div style={{ marginTop: 12, color: "#b91c1c" }}>
              {job.errorMessage}
            </div>
          )}
        </div>
      )}

      {reviewed.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {tableColumns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      ...styles.th,
                      width: getColumnWidth(column),
                      minWidth: getColumnWidth(column),
                      maxWidth: getColumnWidth(column),
                    }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewed.map((item, index) => (
                <tr key={`${item.nominee_name}-${index}`}>
                  {tableColumns.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        ...styles.td,
                        width: getColumnWidth(column),
                        minWidth: getColumnWidth(column),
                        maxWidth: getColumnWidth(column),
                      }}
                    >
                      {formatCellValue(item[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TranslatePanel({
  translateFile,
  setTranslateFile,
  translateRun,
  translateError,
  translateUploading,
  translatedRows,
  translatedLanguages,
  translatedCellCount,
  translatedDownloadUrl,
  translatedDownloadName,
}) {
  const translatedColumns = useMemo(
    () => (translatedRows.length > 0 ? Object.keys(translatedRows[0]) : []),
    [translatedRows]
  );

  return (
    <>
      {/* <div style={{ ...styles.panel, marginTop: 0, background: "#f8fafc" }}>
        <div style={styles.row}>
          <span style={styles.tag}>Configured on server</span>
          <span style={styles.tag}>Bhashini powered</span>
          <span style={styles.tag}>CSV to English</span>
        </div>

        <p style={{ ...styles.note, marginBottom: 0 }}>
          The translation provider settings live in{" "}
          <code>backend/config/bhashini.config.js</code>. You only upload the
          CSV here, and the app translates the rows into English with
          evaluator-friendly column headers so the output can flow straight
          into the Evaluate tab.
        </p>
      </div> */}

      <div style={styles.translateDrop}>
        <div style={styles.row}>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const nextFile = e.target.files[0] || null;
              setTranslateFile(nextFile);
            }}
          />

          <button
            onClick={translateRun}
            style={styles.button}
            disabled={translateUploading}
          >
            {translateUploading ? "Translating..." : "Translate CSV"}
          </button>

          {translatedDownloadUrl && (
            <a
              href={translatedDownloadUrl}
              download={translatedDownloadName || "translated.csv"}
              style={styles.downloadButton}
            >
              Download translated CSV
            </a>
          )}
        </div>

        <p style={{ ...styles.note, marginBottom: 0 }}>
          Supported source languages: Kannada, Hindi, Telugu, Tamil, and
          Malayalam. The translated sheet keeps the same row order but renames
          the headers into English fields that the evaluation flow recognizes.
        </p>

        {translateFile?.name && (
          <div style={{ marginTop: 12, color: "#334155", fontSize: 13 }}>
            Selected file: <strong>{translateFile.name}</strong>
          </div>
        )}
      </div>

      {translateError && (
        <div
          style={{
            ...styles.panel,
            borderColor: "#fecaca",
            background: "#fef2f2",
          }}
        >
          {translateError}
        </div>
      )}

      {(translatedRows.length > 0 || translatedLanguages.length > 0) && (
        <div style={styles.panel}>
          <div style={styles.row}>
            <span style={styles.tag}>
              Detected languages:{" "}
              {translatedLanguages.length > 0
                ? translatedLanguages.join(", ")
                : "English only"}
            </span>
            <span style={styles.tag}>
              Translated cells: {translatedCellCount || 0}
            </span>
            <span style={styles.tag}>Rows: {translatedRows.length || 0}</span>
          </div>
        </div>
      )}

      {translatedRows.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {translatedColumns.map((column) => (
                  <th
                    key={column}
                    style={{
                      ...styles.th,
                      width: getColumnWidth({ key: column }),
                      minWidth: getColumnWidth({ key: column }),
                      maxWidth: getColumnWidth({ key: column }),
                    }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {translatedRows.map((row, rowIndex) => (
                <tr key={`${row.nominee_name || "row"}-${rowIndex}`}>
                  {translatedColumns.map((column) => (
                    <td
                      key={column}
                      style={{
                        ...styles.td,
                        width: getColumnWidth({ key: column }),
                        minWidth: getColumnWidth({ key: column }),
                        maxWidth: getColumnWidth({ key: column }),
                      }}
                    >
                      {formatCellValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("evaluate");

  // Evaluation state
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState(null);
  const [reviewed, setReviewed] = useState([]);
  const [error, setError] = useState("");

  // Translation state
  const [translateSourceFile, setTranslateSourceFile] = useState(null);
  const [translatedDownloadName, setTranslatedDownloadName] = useState(
    "translated_for_evaluation.csv"
  );
  const [translateUploading, setTranslateUploading] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const [translatedRows, setTranslatedRows] = useState([]);
  const [translatedLanguages, setTranslatedLanguages] = useState([]);
  const [translatedCellCount, setTranslatedCellCount] = useState(0);
  const [translatedCsv, setTranslatedCsv] = useState("");
  const [translatedDownloadUrl, setTranslatedDownloadUrl] = useState("");

  const pollRef = useRef(null);

  const downloadUrl = useMemo(() => {
    if (!job?.id) {
      return "";
    }

    return `${API_BASE_URL}/jobs/${job.id}/download`;
  }, [job?.id]);

  useEffect(() => {
    if (translatedDownloadUrl) {
      URL.revokeObjectURL(translatedDownloadUrl);
    }

    if (!translatedCsv) {
      setTranslatedDownloadUrl("");
      return undefined;
    }

    const blob = new Blob([translatedCsv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    setTranslatedDownloadUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [translatedCsv]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (!job?.id) {
      return undefined;
    }

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const statusRes = await axios.get(`${API_BASE_URL}/jobs/${job.id}`);
        if (cancelled) {
          return;
        }

        const nextJob = statusRes.data.job;
        setJob(nextJob);

        if (nextJob.status === "completed") {
          const resultsRes = await axios.get(
            `${API_BASE_URL}/jobs/${job.id}/results`
          );

          if (!cancelled) {
            const reviewedRows = resultsRes.data.reviewed || [];
            setReviewed(reviewedRows);
            logEvaluationDebug(job.id, reviewedRows);
            setUploading(false);
          }
          return;
        }

        if (nextJob.status === "failed") {
          if (!cancelled) {
            setUploading(false);
            setReviewed([]);
          }
          return;
        }

        pollRef.current = setTimeout(pollStatus, 2000);
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError?.response?.data?.error || "Failed to load job.");
          setUploading(false);
        }
      }
    };

    pollStatus();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [job?.id]);

  const uploadFile = async () => {
    setError("");

    if (!file) {
      setError("Please upload a CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setReviewed([]);

    try {
      const res = await axios.post(`${API_BASE_URL}/upload`, formData);

      setJob({
        id: res.data.jobId,
        status: res.data.status,
      });
    } catch (uploadError) {
      setUploading(false);
      setError(
        uploadError?.response?.data?.error || "Upload failed. Please try again."
      );
    }
  };

  const runTranslation = async () => {
    setTranslateError("");

    if (!translateSourceFile) {
      setTranslateError("Please upload a CSV file to translate.");
      return;
    }

    const formData = new FormData();
    formData.append("file", translateSourceFile);

    setTranslateUploading(true);
    setTranslatedRows([]);
    setTranslatedLanguages([]);
    setTranslatedCellCount(0);
    setTranslatedCsv("");

    try {
      const res = await axios.post(`${API_BASE_URL}/translate`, formData);
      const nextRows = res.data.translatedRows || res.data.translated || [];

      setTranslatedRows(nextRows);
      setTranslatedLanguages(res.data.detectedLanguages || []);
      setTranslatedCellCount(res.data.translatedCellCount || 0);
      setTranslatedCsv(res.data.translatedCsv || "");
      setTranslatedDownloadName(
        res.data.downloadName ||
          buildTranslatedDownloadName(translateSourceFile?.name)
      );
    } catch (translateUploadError) {
      setTranslatedRows([]);
      setTranslatedLanguages([]);
      setTranslatedCsv("");
      setTranslatedDownloadUrl("");
      setTranslateError(
        translateUploadError?.response?.data?.error ||
          "Translation failed. Please try again."
      );
    } finally {
      setTranslateUploading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>Shikshagraha award Nomination Evaluation</h1>
      </div>

        <div style={styles.tabs} role="tablist" aria-label="Evaluation tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "evaluate"}
            onClick={() => setActiveTab("evaluate")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "evaluate" ? styles.tabButtonActive : null),
            }}
          >
            Evaluate
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "translate"}
            onClick={() => setActiveTab("translate")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "translate" ? styles.tabButtonActive : null),
            }}
          >
            Translate
          </button>
        </div>

        {activeTab === "evaluate" ? (
          <EvaluatePanel
            setFile={setFile}
            uploading={uploading}
            uploadFile={uploadFile}
            job={job}
            reviewed={reviewed}
            error={error}
            downloadUrl={downloadUrl}
          />
        ) : (
          <TranslatePanel
            translateFile={translateSourceFile}
            setTranslateFile={(nextFile) => {
              setTranslateSourceFile(nextFile);
              setTranslatedRows([]);
              setTranslatedLanguages([]);
              setTranslatedCellCount(0);
              setTranslatedCsv("");
              setTranslatedDownloadUrl("");
              setTranslatedDownloadName(
                buildTranslatedDownloadName(nextFile?.name)
              );
            }}
            translateRun={runTranslation}
            translateError={translateError}
            translateUploading={translateUploading}
            translatedRows={translatedRows}
            translatedLanguages={translatedLanguages}
            translatedCellCount={translatedCellCount}
            translatedDownloadUrl={translatedDownloadUrl}
            translatedDownloadName={translatedDownloadName}
          />
        )}
      </div>
    </div>
  );
}
