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

const styles = {
  page: {
    fontFamily: "Arial, sans-serif",
    padding: 24,
    color: "#111827",
    background: "#f3f4f6",
    minHeight: "100vh",
  },
  shell: {
    maxWidth: 1200,
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 24,
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
  },
  th: {
    textAlign: "left",
    padding: 12,
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    whiteSpace: "nowrap",
    fontSize: 14,
  },
  td: {
    padding: 12,
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
    fontSize: 14,
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
};

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

export default function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState(null);
  const [reviewed, setReviewed] = useState([]);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const downloadUrl = useMemo(() => {
    if (!job?.id) {
      return "";
    }

    return `${API_BASE_URL}/jobs/${job.id}/download`;
  }, [job?.id]);

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

  const jobStatus = job?.status ? STATUS_LABELS[job.status] || job.status : "";
  const progressPercent =
    job?.totalRows && job.totalRows > 0
      ? Math.min(100, Math.round(((job.processedRows || 0) / job.totalRows) * 100))
      : 0;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <h1 style={{ margin: 0 }}>AI Nomination Evaluation</h1>
          <p style={{ margin: "8px 0 0", ...styles.muted }}>
            Upload a CSV, track the job, and download the reviewed workbook when
            processing finishes.
          </p>
        </div>

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
          <div style={{ ...styles.panel, borderColor: "#fecaca", background: "#fef2f2" }}>
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
                  <th style={styles.th}>Nominee</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Self Nomination</th>
                  <th style={styles.th}>Self Nomination Reason</th>
                  <th style={styles.th}>Overall</th>
                  <th style={styles.th}>Continuous Rating</th>
                  <th style={styles.th}>Collaboration Rating</th>
                  <th style={styles.th}>Innovation Rating</th>
                  <th style={styles.th}>Inclusivity Rating</th>
                  <th style={styles.th}>Evidence Count</th>
                  <th style={styles.th}>Evidences</th>
                  <th style={styles.th}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {reviewed.map((item, index) => (
                  <tr key={`${item.nominee_name}-${index}`}>
                    <td style={styles.td}>{item.nominee_name}</td>
                    <td style={styles.td}>{item.evaluation_status}</td>
                    <td style={styles.td}>{item.self_nomination_detected || ""}</td>
                    <td style={{ ...styles.td, minWidth: 260, wordBreak: "break-word" }}>
                      {item.self_nomination_reason || ""}
                    </td>
                    <td style={styles.td}>{item.overall_score || ""}</td>
                    <td style={styles.td}>{item.continuous_improvement_score || ""}</td>
                    <td style={styles.td}>{item.collaboration_score || ""}</td>
                    <td style={styles.td}>{item.innovation_score || ""}</td>
                    <td style={styles.td}>{item.inclusivity_score || ""}</td>
                    <td style={styles.td}>{item.evidence_count || ""}</td>
                    <td style={{ ...styles.td, minWidth: 240, wordBreak: "break-word" }}>
                      {item.evidences}
                    </td>
                    <td style={{ ...styles.td, minWidth: 360, wordBreak: "break-word" }}>
                      {item.detailed_summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
