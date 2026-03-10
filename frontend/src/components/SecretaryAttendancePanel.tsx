import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import jsQR from "jsqr";
import api from "../services/api";

interface EventRecord {
  id: number;
  title: string;
  event_type: "meeting" | "activity" | "event";
  starts_at: string;
  attendance_count: number;
  is_immutable: boolean;
}

interface AttendanceRecord {
  id: number;
  subject_type: "member" | "applicant" | "user";
  subject_name: string;
  member_number?: string | null;
  email?: string | null;
  batch?: string | null;
  applicant_status?: string | null;
  scanned_at: string;
  scanned_by?: { id: number; name: string } | null;
}

interface SecretaryAttendancePanelProps {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

type ScanResultRecord = AttendanceRecord & {
  statusLabel: string;
};

export default function SecretaryAttendancePanel({ onNotice, onError }: SecretaryAttendancePanelProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [roster, setRoster] = useState<AttendanceRecord[]>([]);
  const [manualToken, setManualToken] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [lastResolvedRecord, setLastResolvedRecord] = useState<ScanResultRecord | null>(null);
  const [recentResolvedRecords, setRecentResolvedRecords] = useState<ScanResultRecord[]>([]);
  const [shutterActive, setShutterActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scanLockRef = useRef(false);
  const cameraActiveRef = useRef(false);
  const selectedEventIdRef = useRef<number | null>(null);

  const selectedEvent = events.find((item) => item.id === selectedEventId) ?? null;
  const visibleRoster = selectedEventId ? roster : [];

  const sanitizeCsvValue = (value: string | number | null | undefined) => {
    const text = String(value ?? "").replace(/"/g, '""');
    return `"${text}"`;
  };

  const triggerCsvDownload = (filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) => {
    const csvContent = [headers, ...rows]
      .map((row) => row.map((value) => sanitizeCsvValue(value)).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const buildAttendanceFilename = (suffix: string) => {
    const eventLabel = selectedEvent?.title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const safeEventLabel = eventLabel || "attendance-event";
    return `lgec-${safeEventLabel}-${suffix}.csv`;
  };

  const exportRoster = () => {
    if (!selectedEvent) {
      onError("Choose an event before exporting attendance.");
      return;
    }

    triggerCsvDownload(
      buildAttendanceFilename("roster"),
      ["Event", "Person", "Type", "Member Number", "Email", "Batch", "Applicant Status", "Scanned At"],
      visibleRoster.map((record) => [
        selectedEvent.title,
        record.subject_name,
        record.subject_type,
        record.member_number ?? "",
        record.email ?? "",
        record.batch ?? "",
        record.applicant_status ?? "",
        new Date(record.scanned_at).toLocaleString(),
      ]),
    );
    onNotice("Attendance roster export started.");
  };

  const exportRecentScans = () => {
    if (!selectedEvent) {
      onError("Choose an event before exporting recent scans.");
      return;
    }

    triggerCsvDownload(
      buildAttendanceFilename("recent-scans"),
      ["Event", "Person", "Type", "Member Number", "Batch or Status", "Result", "Scanned At"],
      recentResolvedRecords.map((record) => [
        selectedEvent.title,
        record.subject_name,
        record.subject_type,
        record.member_number ?? "",
        record.batch ?? record.applicant_status ?? "",
        record.statusLabel,
        new Date(record.scanned_at).toLocaleString(),
      ]),
    );
    onNotice("Recent scan export started.");
  };

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.get<{ data: EventRecord[] }>("/calendar/events");
      setEvents(res.data.data ?? []);
      setSelectedEventId((current) => current ?? res.data.data?.[0]?.id ?? null);
    } catch {
      onError("Unable to load attendance events.");
    }
  }, [onError]);

  const loadRoster = useCallback(async (eventId: number) => {
    try {
      const res = await api.get<{ data: AttendanceRecord[] }>(`/attendance/events/${eventId}/records`);
      setRoster(res.data.data ?? []);
    } catch {
      onError("Unable to load attendance roster.");
    }
  }, [onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedEventId) return;

    const timer = window.setTimeout(() => {
      void loadRoster(selectedEventId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRoster, selectedEventId]);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    setLastResolvedRecord(null);
    setRecentResolvedRecords([]);
  }, [selectedEventId]);

  const stopCamera = () => {
    cameraActiveRef.current = false;
    setShutterActive(false);
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => stopCamera, []);

  const playScanSound = useCallback(() => {
    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const context = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = context;

    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const startTime = context.currentTime;

    const oscillatorTwo = context.createOscillator();
    const gainNodeTwo = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1480, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(640, startTime + 0.03);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.14, startTime + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillatorTwo.type = "triangle";
    oscillatorTwo.frequency.setValueAtTime(420, startTime + 0.015);
    oscillatorTwo.frequency.exponentialRampToValueAtTime(220, startTime + 0.08);

    gainNodeTwo.gain.setValueAtTime(0.0001, startTime + 0.015);
    gainNodeTwo.gain.exponentialRampToValueAtTime(0.08, startTime + 0.025);
    gainNodeTwo.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.1);

    oscillatorTwo.connect(gainNodeTwo);
    gainNodeTwo.connect(context.destination);

    oscillator.start(startTime);
    oscillatorTwo.start(startTime + 0.015);
    oscillator.stop(startTime + 0.08);
    oscillatorTwo.stop(startTime + 0.11);
  }, []);

  const submitToken = async (token: string) => {
    const eventId = selectedEventIdRef.current;
    if (!eventId || !token.trim()) return;

    try {
      const res = await api.post<{ message?: string; record?: AttendanceRecord }>(`/attendance/events/${eventId}/scan`, {
        qr_token: token.trim(),
      });
      const statusLabel = res.status === 201 ? "Recorded" : "Already Recorded";
      const resolvedRecord = res.data.record
        ? { ...res.data.record, statusLabel }
        : null;

      if (resolvedRecord) {
        setShutterActive(true);
        setLastResolvedRecord(resolvedRecord);
        setRecentResolvedRecords((current) => {
          const next = [resolvedRecord, ...current.filter((item) => item.id !== resolvedRecord.id)];
          return next.slice(0, 8);
        });
        playScanSound();
        window.setTimeout(() => {
          setShutterActive(false);
        }, 240);
        stopCamera();
      }

      onNotice(res.data?.message ?? "Attendance recorded.");
      setManualToken("");
      await Promise.all([loadEvents(), loadRoster(eventId)]);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? "Unable to record attendance.")
        : "Unable to record attendance.";
      onError(message);
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraActiveRef.current) return;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      rafRef.current = window.requestAnimationFrame(scanFrame);
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);

    if (result?.data && !scanLockRef.current) {
      scanLockRef.current = true;
      void submitToken(result.data).finally(() => {
        window.setTimeout(() => {
          scanLockRef.current = false;
        }, 400);
      });
    }

    rafRef.current = window.requestAnimationFrame(scanFrame);
  };

  const startCamera = async () => {
    if (cameraActive) return;
    if (!selectedEventId) {
      onError("Choose an event before starting the scanner.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      cameraActiveRef.current = true;
      setCameraActive(true);
      rafRef.current = window.requestAnimationFrame(scanFrame);
    } catch {
      cameraActiveRef.current = false;
      onError("Unable to open the camera scanner. Check browser camera permission and HTTPS context.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/20 bg-white/10 p-4">
        <h2 className="font-heading text-2xl text-offwhite">Attendance Flow</h2>
        <p className="mt-2 text-sm text-mist/80">
          Select a meeting, then scan each member or applicant QR code. Duplicate scans are prevented per event.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Attendance Event</label>
            <select
              value={selectedEventId ? String(selectedEventId) : ""}
              onChange={(e) => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Choose event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {event.title} ({new Date(event.starts_at).toLocaleDateString()})
                </option>
              ))}
            </select>
            <div className="mt-3 text-sm text-mist/80">
              <p>Type: <span className="text-offwhite capitalize">{selectedEvent?.event_type ?? "—"}</span></p>
              <p className="mt-1">Current Attendance: <span className="text-offwhite">{selectedEvent?.attendance_count ?? 0}</span></p>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void startCamera()} disabled={!selectedEventId || cameraActive}>Start Scanner</button>
              <button type="button" className="rounded-md border border-white/25 px-3 py-2 text-sm text-offwhite disabled:opacity-50" onClick={stopCamera} disabled={!cameraActive}>Stop Scanner</button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="relative overflow-hidden rounded-xl border border-white/15 bg-black">
                <video ref={videoRef} className="min-h-[260px] w-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className={`absolute inset-0 bg-black transition-transform duration-150 ${shutterActive ? "scale-y-100" : "scale-y-0"}`}
                    style={{ transformOrigin: "center" }}
                  />
                  <div className="absolute left-1/2 top-1/2 h-[58%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gold/60 shadow-[0_0_0_9999px_rgba(5,11,23,0.32)]" />
                  <div className="absolute left-1/2 top-1/2 h-[58%] w-[72%] -translate-x-1/2 -translate-y-1/2">
                    <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-gold-soft" />
                    <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-gold-soft" />
                    <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-gold-soft" />
                    <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-gold-soft" />
                    <div className="absolute left-1/2 top-1/2 h-px w-full -translate-x-1/2 -translate-y-1/2 bg-gold/60" />
                  </div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-ink/70 px-3 py-1 text-xs text-offwhite">
                    {cameraActive ? "Align the QR code inside the frame." : "Start scanner when ready for the next QR code."}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Manual QR Token</label>
                <textarea
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="min-h-[180px] w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
                  placeholder="Paste a QR token here if camera scanning is unavailable."
                />
                <button type="button" className="btn-secondary mt-3 w-full" onClick={() => void submitToken(manualToken)} disabled={!selectedEventId || !manualToken.trim()}>
                  Record Attendance
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gold/20 bg-navy/35 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl text-offwhite">Resolved Scan</h3>
            <p className="mt-1 text-sm text-mist/80">
              When a QR code is detected, the app resolves the person immediately and highlights the latest result here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-white/25 px-3 py-2 text-sm text-offwhite disabled:opacity-50"
              onClick={exportRecentScans}
              disabled={!selectedEventId || recentResolvedRecords.length === 0}
            >
              Export Recent Scans CSV
            </button>
            {lastResolvedRecord && (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                lastResolvedRecord.statusLabel === "Recorded"
                  ? "border-green-300/40 bg-green-400/15 text-green-100"
                  : "border-gold/40 bg-gold/12 text-gold-soft"
              }`}>
                {lastResolvedRecord.statusLabel}
              </span>
            )}
          </div>
        </div>

        {lastResolvedRecord ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Person</p>
              <p className="mt-1 text-lg font-semibold text-offwhite">{lastResolvedRecord.subject_name}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Type</p>
              <p className="mt-1 text-lg capitalize text-offwhite">{lastResolvedRecord.subject_type}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Member Number</p>
              <p className="mt-1 text-lg text-offwhite">{lastResolvedRecord.member_number ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Batch / Status</p>
              <p className="mt-1 text-lg text-offwhite">{lastResolvedRecord.batch ?? lastResolvedRecord.applicant_status ?? "—"}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-white/15 bg-white/5 px-4 py-6 text-sm text-mist/80">
            No QR code resolved yet for this event.
          </div>
        )}

        <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4">
          <h4 className="font-heading text-lg text-offwhite">Recent Scan Results</h4>
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-3 py-2 text-left">Person</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Member Number</th>
                  <th className="px-3 py-2 text-left">Batch / Status</th>
                  <th className="px-3 py-2 text-left">Result</th>
                  <th className="px-3 py-2 text-left">Scanned At</th>
                </tr>
              </thead>
              <tbody>
                {recentResolvedRecords.map((record) => (
                  <tr key={`${record.id}-${record.statusLabel}`} className="border-b border-white/10">
                    <td className="px-3 py-2">{record.subject_name}</td>
                    <td className="px-3 py-2 capitalize">{record.subject_type}</td>
                    <td className="px-3 py-2">{record.member_number ?? "—"}</td>
                    <td className="px-3 py-2">{record.batch ?? record.applicant_status ?? "—"}</td>
                    <td className="px-3 py-2">{record.statusLabel}</td>
                    <td className="px-3 py-2">{new Date(record.scanned_at).toLocaleString()}</td>
                  </tr>
                ))}
                {recentResolvedRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-mist/80">
                      Scanned people will appear here as soon as the QR code is resolved.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/20 bg-white/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-xl text-offwhite">Attendance Roster</h3>
            <p className="mt-1 text-sm text-mist/80">
              Export the selected event roster when the secretary needs an attendance list outside the portal.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/25 px-3 py-2 text-sm text-offwhite disabled:opacity-50"
            onClick={exportRoster}
            disabled={!selectedEventId || visibleRoster.length === 0}
          >
            Export Attendance Roster CSV
          </button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/15">
          <table className="min-w-full text-sm text-offwhite">
            <thead className="bg-navy/70 text-gold-soft">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Member Number</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Batch</th>
                <th className="px-3 py-2 text-left">Applicant Status</th>
                <th className="px-3 py-2 text-left">Scanned At</th>
              </tr>
            </thead>
            <tbody>
              {visibleRoster.map((record) => (
                <tr key={record.id} className="border-b border-white/10">
                  <td className="px-3 py-2">{record.subject_name}</td>
                  <td className="px-3 py-2 capitalize">{record.subject_type}</td>
                  <td className="px-3 py-2">{record.member_number ?? "—"}</td>
                  <td className="px-3 py-2">{record.email ?? "—"}</td>
                  <td className="px-3 py-2">{record.batch ?? "—"}</td>
                  <td className="px-3 py-2">{record.applicant_status ?? "—"}</td>
                  <td className="px-3 py-2">{new Date(record.scanned_at).toLocaleString()}</td>
                </tr>
              ))}
              {visibleRoster.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-mist/80">
                    No attendance records yet for the selected event.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
