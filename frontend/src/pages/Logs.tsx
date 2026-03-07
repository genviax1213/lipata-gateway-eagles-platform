import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission, isAdminUser } from "../utils/auth";

type LogEntry = {
  timestamp: string | null;
  level: string;
  event: string;
  message: string;
  context: Record<string, unknown> | null;
  raw: string;
};

type PaginationMeta = {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
};

type ArchiveItem = {
  name: string;
  size_bytes: number;
  modified_at: string;
};

type LogsTab = "current" | "archives";

function parseError(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const payload = error.response?.data as { message?: string } | undefined;
  return payload?.message || fallback;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const LOGS_PAGE_SIZE = 10;

export default function Logs() {
  const { user } = useAuth();
  const canViewLogs = isAdminUser(user) || hasPermission(user, "members.view");
  const canManageLogs = isAdminUser(user) || hasPermission(user, "members.delete");

  const [activeTab, setActiveTab] = useState<LogsTab>("current");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, per_page: LOGS_PAGE_SIZE, total: 0, last_page: 1 });
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [archiveEntries, setArchiveEntries] = useState<LogEntry[]>([]);
  const [archiveMeta, setArchiveMeta] = useState<PaginationMeta>({ page: 1, per_page: LOGS_PAGE_SIZE, total: 0, last_page: 1 });
  const [selectedArchive, setSelectedArchive] = useState<string>("");
  const [currentLogsLoaded, setCurrentLogsLoaded] = useState(false);
  const [archivesLoaded, setArchivesLoaded] = useState(false);

  const [level, setLevel] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadLogs = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ data: LogEntry[]; meta: PaginationMeta }>("/admin/logs", {
        params: { page: nextPage, per_page: LOGS_PAGE_SIZE, level: level || undefined, event: eventFilter || undefined, q: query || undefined, _t: Date.now() },
      });
      setEntries(res.data.data);
      setMeta(res.data.meta);
      setCurrentLogsLoaded(true);
    } catch (err) {
      setError(parseError(err, "Unable to load logs."));
    } finally {
      setLoading(false);
    }
  }, [eventFilter, level, page, query]);

  const loadArchives = useCallback(async () => {
    try {
      const res = await api.get<{ data: ArchiveItem[] }>("/admin/logs/archives");
      setArchives(res.data.data);
      if (res.data.data.length === 0) {
        setSelectedArchive("");
        setArchiveEntries([]);
      } else if (!selectedArchive || !res.data.data.some((item) => item.name === selectedArchive)) {
        setSelectedArchive(res.data.data[0].name);
      }
      setArchivesLoaded(true);
    } catch (err) {
      setError(parseError(err, "Unable to load archive list."));
    }
  }, [selectedArchive]);

  const loadArchiveContent = useCallback(async () => {
    if (!selectedArchive) return;
    setArchiveLoading(true);
    setError("");
    try {
      const res = await api.get<{ data: LogEntry[]; meta: PaginationMeta }>(
        `/admin/logs/archives/${encodeURIComponent(selectedArchive)}/content`,
        { params: { page: archivePage, per_page: LOGS_PAGE_SIZE } },
      );
      setArchiveEntries(res.data.data);
      setArchiveMeta(res.data.meta);
      setArchivesLoaded(true);
    } catch (err) {
      setError(parseError(err, "Unable to load compressed log content."));
    } finally {
      setArchiveLoading(false);
    }
  }, [archivePage, selectedArchive]);

  useEffect(() => {
    if (!canViewLogs || currentLogsLoaded) return;
    void loadLogs(1);
  }, [canViewLogs, currentLogsLoaded, loadLogs]);

  useEffect(() => {
    if (!canViewLogs || activeTab !== "archives" || archivesLoaded) return;
    void loadArchives();
  }, [activeTab, archivesLoaded, canViewLogs, loadArchives]);

  useEffect(() => {
    if (!canViewLogs || !selectedArchive || !archivesLoaded) return;
    void loadArchiveContent();
  }, [archivesLoaded, canViewLogs, loadArchiveContent, selectedArchive]);

  const runAction = async (
    request: () => Promise<unknown>,
    successMessage: string,
    options?: { clearCurrentView?: boolean },
  ) => {
    setError("");
    setNotice("");
    try {
      await request();
      if (options?.clearCurrentView) {
        setEntries([]);
        setMeta((prev) => ({ ...prev, page: 1, last_page: 1, total: 0 }));
        setCurrentLogsLoaded(false);
      }
      setNotice(successMessage);
      setPage(1);
      setArchivePage(1);
      if (currentLogsLoaded) {
        await loadLogs(1);
      }
      if (archivesLoaded) {
        await loadArchives();
      }
      if (selectedArchive && archivesLoaded) {
        await loadArchiveContent();
      }
    } catch (err) {
      setError(parseError(err, "Action failed."));
    }
  };

  const downloadSelectedArchive = async () => {
    if (!selectedArchive) return;
    setError("");
    setNotice("");
    try {
      const response = await api.get(`/admin/logs/archives/${encodeURIComponent(selectedArchive)}/download`, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/gzip" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = selectedArchive;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setNotice("Archive download started.");
    } catch (err) {
      setError(parseError(err, "Unable to download selected archive."));
    }
  };

  const downloadCurrentLog = async () => {
    setError("");
    setNotice("");
    try {
      const response = await api.get("/admin/logs/current/download", {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "laravel.log";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setNotice("Current log download started.");
    } catch (err) {
      setError(parseError(err, "Unable to download current log."));
    }
  };

  const archiveOptions = useMemo(
    () => archives.map((item) => (
      <option
        key={item.name}
        value={item.name}
        style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}
      >
        {item.name}
      </option>
    )),
    [archives],
  );

  if (!canViewLogs) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Logs</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to view logs.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="font-heading text-4xl text-offwhite">Logs</h1>
        <p className="mt-2 text-sm text-mist/85">
          Review audit/system logs, compress old logs to save disk space, and manage compressed archives.
        </p>
      </header>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p> : null}
      {notice ? <p className="rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{notice}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={`rounded-md border px-4 py-2 text-sm ${activeTab === "current" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
        >
          Current Logs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("archives")}
          className={`rounded-md border px-4 py-2 text-sm ${activeTab === "archives" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
        >
          Compressed Archives
        </button>
      </div>

      {activeTab === "current" ? (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-3 text-lg font-semibold text-offwhite">Current Logs</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              placeholder="Filter by event"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
            />
            <input
              placeholder="Search text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
            />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All levels</option>
              <option value="INFO" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>INFO</option>
              <option value="WARNING" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>WARNING</option>
              <option value="ERROR" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>ERROR</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                void loadLogs(1);
              }}
              className="btn-secondary"
            >
              Refresh
            </button>
          </div>

          {canManageLogs ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-gold/40 px-3 py-2 text-sm text-gold-soft transition hover:bg-gold/10"
                onClick={() => void downloadCurrentLog()}
              >
                Download Current Log
              </button>
              <button
                type="button"
                className="rounded-md border border-gold/40 px-3 py-2 text-sm text-gold-soft transition hover:bg-gold/10"
                onClick={() => void runAction(() => api.post("/admin/logs/compress"), "Current logs compressed.")}
              >
                Compress Current Logs
              </button>
              <button
                type="button"
                className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/10"
                onClick={() => void runAction(() => api.delete("/admin/logs/current"), "Current logs cleared.", { clearCurrentView: true })}
              >
                Clear Current Logs
              </button>
            </div>
          ) : null}

          {!currentLogsLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Loading current logs...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {loading ? <p className="text-sm text-mist/80">Loading logs...</p> : null}
                {!loading && entries.length === 0 ? <p className="text-sm text-mist/80">No matching log entries.</p> : null}
                {!loading && entries.map((entry, idx) => (
                  <article key={`${entry.timestamp}-${idx}`} className="rounded-md border border-white/20 bg-navy/40 p-3">
                    <p className="text-xs text-mist/75">{entry.timestamp ?? "-"} | {entry.level}</p>
                    <p className="mt-1 text-sm font-semibold text-gold-soft">{entry.event || "(no event name)"}</p>
                    {entry.context ? (
                      <pre className="mt-2 max-h-32 overflow-auto rounded border border-white/15 bg-black/20 p-2 text-xs text-mist/80">{JSON.stringify(entry.context, null, 2)}</pre>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-mist/75">
                <span>Page {meta.page} of {meta.last_page} | Total {meta.total}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={meta.page <= 1}
                    onClick={() => {
                      const nextPage = Math.max(1, meta.page - 1);
                      setPage(nextPage);
                      void loadLogs(nextPage);
                    }}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={meta.page >= meta.last_page}
                    onClick={() => {
                      const nextPage = Math.min(meta.last_page, meta.page + 1);
                      setPage(nextPage);
                      void loadLogs(nextPage);
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-3 text-lg font-semibold text-offwhite">Compressed Archives</h2>
          <p className="mb-3 text-xs text-mist/75">
            Archives older than 2 years are auto-deleted during archive operations.
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={selectedArchive}
              onChange={(e) => {
                setSelectedArchive(e.target.value);
                setArchivePage(1);
              }}
              className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
            >
              {archives.length === 0 ? <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>No archives</option> : archiveOptions}
            </select>
            <button
              type="button"
              onClick={() => {
                setArchivePage(1);
                void loadArchives();
              }}
              className="btn-secondary"
            >
              Refresh
            </button>
            {selectedArchive ? (
              <button
                type="button"
                onClick={() => void downloadSelectedArchive()}
                className="rounded-md border border-gold/40 px-3 py-2 text-sm text-gold-soft transition hover:bg-gold/10"
              >
                Download Selected Archive
              </button>
            ) : null}
            {canManageLogs && selectedArchive ? (
              <button
                type="button"
                onClick={() => void runAction(() => api.delete(`/admin/logs/archives/${encodeURIComponent(selectedArchive)}`), "Archive deleted.")}
                className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/10"
              >
                Delete Selected Archive
              </button>
            ) : null}
          </div>

          {!archivesLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Loading archives...
            </div>
          ) : (
            <>
              <div className="mb-3 max-h-36 overflow-auto rounded-md border border-white/20 bg-black/10 p-2 text-xs">
                {archives.length === 0 ? <p className="text-mist/75">No archives available.</p> : archives.map((item) => (
                  <p key={item.name} className="text-mist/80">{item.name} | {formatBytes(item.size_bytes)} | {new Date(item.modified_at).toLocaleString()}</p>
                ))}
              </div>

              {selectedArchive ? (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-offwhite">Contents: {selectedArchive}</h3>
                  {archiveLoading ? <p className="text-sm text-mist/80">Loading archive content...</p> : null}
                  {!archiveLoading && archiveEntries.length === 0 ? <p className="text-sm text-mist/80">No entries in selected archive.</p> : null}
                  <div className="space-y-2">
                    {!archiveLoading && archiveEntries.map((entry, idx) => (
                      <article key={`${entry.timestamp}-${idx}`} className="rounded-md border border-white/20 bg-navy/40 p-3">
                        <p className="text-xs text-mist/75">{entry.timestamp ?? "-"} | {entry.level}</p>
                        <p className="mt-1 text-sm font-semibold text-gold-soft">{entry.event || "(no event name)"}</p>
                      </article>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-mist/75">
                    <span>Page {archiveMeta.page} of {archiveMeta.last_page} | Total {archiveMeta.total}</span>
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary" disabled={archiveMeta.page <= 1} onClick={() => setArchivePage((p) => Math.max(1, p - 1))}>Prev</button>
                      <button type="button" className="btn-secondary" disabled={archiveMeta.page >= archiveMeta.last_page} onClick={() => setArchivePage((p) => Math.min(archiveMeta.last_page, p + 1))}>Next</button>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}
