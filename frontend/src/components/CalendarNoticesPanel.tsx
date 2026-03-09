import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";

type EventType = "meeting" | "activity" | "event";

interface CalendarEventRecord {
  id: number;
  title: string;
  event_type: EventType;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  attendance_count: number;
  is_immutable: boolean;
  created_by?: { id: number; name: string } | null;
}

interface CalendarNoticesPanelProps {
  canManage: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

function toLocalDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(value: string): Date {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

export default function CalendarNoticesPanel({ canManage, onNotice, onError }: CalendarNoticesPanelProps) {
  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    event_type: "meeting" as EventType,
    starts_at: "",
    ends_at: "",
    location: "",
    description: "",
  });

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.get<{ data: CalendarEventRecord[] }>("/calendar/events");
      setEvents(res.data.data ?? []);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? "Unable to load calendar notices.")
        : "Unable to load calendar notices.";
      onError(message);
    }
  }, [onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadEvents]);

  const selectedMonthDate = useMemo(() => startOfMonth(selectedMonth), [selectedMonth]);
  const calendarCells = useMemo(() => {
    const firstDay = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - start.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const iso = date.toISOString().slice(0, 10);
      const dayEvents = events.filter((event) => event.starts_at.slice(0, 10) === iso);

      return {
        iso,
        label: date.getDate(),
        inMonth: date.getMonth() === selectedMonthDate.getMonth(),
        events: dayEvents,
      };
    });
  }, [events, selectedMonthDate]);

  const upcomingEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [events],
  );

  const resetForm = () => {
    setEditingId(null);
    setForm({
      title: "",
      event_type: "meeting",
      starts_at: "",
      ends_at: "",
      location: "",
      description: "",
    });
  };

  const saveEvent = async () => {
    try {
      const payload = {
        ...form,
        ends_at: form.ends_at || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
      };

      if (editingId) {
        const res = await api.put<{ message?: string }>(`/calendar/events/${editingId}`, payload);
        onNotice(res.data?.message ?? "Calendar event updated.");
      } else {
        const res = await api.post<{ message?: string }>("/calendar/events", payload);
        onNotice(res.data?.message ?? "Calendar event created.");
      }

      resetForm();
      await loadEvents();
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? "Unable to save calendar event.")
        : "Unable to save calendar event.";
      onError(message);
    }
  };

  const deleteEvent = async (eventId: number) => {
    if (!window.confirm("Delete this calendar event?")) return;

    try {
      const res = await api.delete<{ message?: string }>(`/calendar/events/${eventId}`);
      onNotice(res.data?.message ?? "Calendar event deleted.");
      if (editingId === eventId) resetForm();
      await loadEvents();
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? "Unable to delete calendar event.")
        : "Unable to delete calendar event.";
      onError(message);
    }
  };

  const beginEdit = (event: CalendarEventRecord) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      event_type: event.event_type,
      starts_at: toLocalDateTimeInput(event.starts_at),
      ends_at: toLocalDateTimeInput(event.ends_at),
      location: event.location ?? "",
      description: event.description ?? "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/20 bg-white/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl text-offwhite">Meetings, Activities, and Events</h2>
            <p className="mt-2 text-sm text-mist/80">
              All users can view the shared schedule here. Events become immutable once attendance has been recorded.
            </p>
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
          />
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.18em] text-gold-soft">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <div key={label} className="rounded-md border border-white/10 bg-white/5 px-2 py-2">{label}</div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {calendarCells.map((cell) => (
            <div
              key={cell.iso}
              className={`min-h-[120px] rounded-md border px-2 py-2 ${cell.inMonth ? "border-white/15 bg-white/5" : "border-white/5 bg-white/[0.03]"}`}
            >
              <p className={`text-xs ${cell.inMonth ? "text-offwhite" : "text-mist/45"}`}>{cell.label}</p>
              <div className="mt-2 space-y-1">
                {cell.events.slice(0, 3).map((event) => (
                  <div key={event.id} className="rounded bg-gold/10 px-2 py-1 text-[11px] text-gold-soft">
                    <p className="truncate font-semibold">{event.title}</p>
                    <p>{new Date(event.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                ))}
                {cell.events.length > 3 && <p className="text-[11px] text-mist/70">+{cell.events.length - 3} more</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h3 className="font-heading text-xl text-offwhite">Upcoming Schedule</h3>
          <div className="mt-4">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="border-t border-white/10 py-4 first:border-t-0 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">{event.event_type}</p>
                    <p className="mt-1 text-lg font-semibold text-offwhite">{event.title}</p>
                    <p className="mt-1 text-sm text-mist/80">
                      {new Date(event.starts_at).toLocaleString()}
                      {event.ends_at ? ` to ${new Date(event.ends_at).toLocaleString()}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-mist/80">Location: <span className="text-offwhite">{event.location ?? "To be announced"}</span></p>
                    {event.description ? <p className="mt-2 text-sm text-mist/75">{event.description}</p> : null}
                  </div>
                  <div className="text-right text-xs text-mist/70">
                    <p>Attendance: {event.attendance_count}</p>
                    <p>{event.is_immutable ? "Immutable" : "Editable"}</p>
                  </div>
                </div>
                {canManage && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => beginEdit(event)} disabled={event.is_immutable}>Edit</button>
                    <button type="button" className="rounded-md border border-red-300/40 px-3 py-2 text-sm text-red-200 transition hover:bg-red-400/10 disabled:opacity-50" onClick={() => void deleteEvent(event.id)} disabled={event.is_immutable}>Delete</button>
                  </div>
                )}
              </div>
            ))}
            {upcomingEvents.length === 0 && <p className="text-sm text-mist/75">No meetings, activities, or events scheduled yet.</p>}
          </div>
        </div>

        {canManage && (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading text-xl text-offwhite">{editingId ? "Edit Event" : "Create Event"}</h3>
              {editingId ? (
                <button type="button" className="rounded-md border border-white/25 px-3 py-2 text-sm text-offwhite" onClick={resetForm}>
                  Clear
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Title</label>
                <input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Type</label>
                <select value={form.event_type} onChange={(e) => setForm((current) => ({ ...current, event_type: e.target.value as EventType }))} className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite">
                  <option value="meeting" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Meeting</option>
                  <option value="activity" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Activity</option>
                  <option value="event" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Event</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Starts</label>
                <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((current) => ({ ...current, starts_at: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Ends</label>
                <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((current) => ({ ...current, ends_at: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Location</label>
                <input value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-gold-soft">Description</label>
                <textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} className="min-h-[120px] w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite" />
              </div>
              <button type="button" className="btn-primary" onClick={() => void saveEvent()}>
                {editingId ? "Save Changes" : "Create Event"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
