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

export default function SecretaryAttendancePanel({ onNotice, onError }: SecretaryAttendancePanelProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [roster, setRoster] = useState<AttendanceRecord[]>([]);
  const [manualToken, setManualToken] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanLockRef = useRef(false);

  const selectedEvent = events.find((item) => item.id === selectedEventId) ?? null;
  const visibleRoster = selectedEventId ? roster : [];

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

  const stopCamera = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => stopCamera, []);

  const submitToken = async (token: string) => {
    if (!selectedEventId || !token.trim()) return;

    try {
      const res = await api.post<{ message?: string }>(`/attendance/events/${selectedEventId}/scan`, {
        qr_token: token.trim(),
      });
      onNotice(res.data?.message ?? "Attendance recorded.");
      setManualToken("");
      await Promise.all([loadEvents(), loadRoster(selectedEventId)]);
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
    if (!video || !canvas || !cameraActive) return;

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
        }, 1500);
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

      setCameraActive(true);
      rafRef.current = window.requestAnimationFrame(scanFrame);
    } catch {
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
          <div className="rounded-xl border border-white/15 bg-white/5 p-4">
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

          <div className="rounded-xl border border-white/15 bg-white/5 p-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void startCamera()} disabled={!selectedEventId || cameraActive}>Start Scanner</button>
              <button type="button" className="rounded-md border border-white/25 px-3 py-2 text-sm text-offwhite disabled:opacity-50" onClick={stopCamera} disabled={!cameraActive}>Stop Scanner</button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="overflow-hidden rounded-xl border border-white/15 bg-black">
                <video ref={videoRef} className="min-h-[260px] w-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <div className="rounded-xl border border-white/15 bg-white/5 p-4">
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

      <div className="rounded-xl border border-white/20 bg-white/10 p-4">
        <h3 className="font-heading text-xl text-offwhite">Attendance Roster</h3>
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
