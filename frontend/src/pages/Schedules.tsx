import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

type ScheduleEvent = {
  id: number;
  title: string;
  event_type: "meeting" | "activity" | "event";
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  description: string | null;
};

function formatScheduleRange(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;

  if (Number.isNaN(start.getTime())) {
    return "Schedule time unavailable";
  }

  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(start);

  const timeFormatter = new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });

  const startTime = timeFormatter.format(start);
  if (!end || Number.isNaN(end.getTime())) {
    return `${dateLabel} at ${startTime}`;
  }

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${dateLabel} at ${startTime} to ${timeFormatter.format(end)}`;
  }

  const endLabel = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(end);

  return `${dateLabel} at ${startTime} until ${endLabel}`;
}

export default function Schedules() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get<{ data?: ScheduleEvent[] }>("/content/schedules");
        if (!mounted) return;
        setEvents(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch {
        if (!mounted) return;
        setError("Unable to load the public schedule right now.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const groupedEvents = useMemo(() => {
    return events.reduce<Record<string, ScheduleEvent[]>>((groups, event) => {
      const key = event.event_type;
      groups[key] = groups[key] ?? [];
      groups[key].push(event);
      return groups;
    }, {});
  }, [events]);

  const groupOrder: Array<ScheduleEvent["event_type"]> = ["meeting", "activity", "event"];
  const groupLabels: Record<ScheduleEvent["event_type"], string> = {
    meeting: "Meetings",
    activity: "Activities",
    event: "Events",
  };

  return (
    <section className="section-wrap py-16 md:py-20">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.24em] text-gold-soft">Programs</p>
        <h2 className="mt-3 font-heading text-4xl text-offwhite md:text-5xl">
          Schedules
        </h2>
        <p className="mt-4 text-sm text-mist/85 md:text-base">
          Upcoming meeting, activity, and event schedules published from the club calendar by authorized officers.
        </p>
      </div>

      {loading && (
        <div className="surface-card mt-8 p-6 text-sm text-mist/85">
          Loading schedules...
        </div>
      )}

      {!loading && error && (
        <div className="surface-card mt-8 p-6 text-sm text-mist/85">
          {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="surface-card mt-8 p-6 text-sm text-mist/85">
          No upcoming schedules are posted yet.
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="mt-8 space-y-8">
          {groupOrder.filter((type) => groupedEvents[type]?.length).map((type) => (
            <section key={type} className="space-y-4">
              <h3 className="font-heading text-2xl text-offwhite">
                {groupLabels[type]}
              </h3>
              <div className="grid gap-4">
                {groupedEvents[type].map((event) => (
                  <article key={event.id} className="surface-card card-lift p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-heading text-2xl text-offwhite">{event.title}</h4>
                        <p className="mt-2 text-sm text-gold-soft">
                          {formatScheduleRange(event.starts_at, event.ends_at)}
                        </p>
                      </div>
                      <span className="rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gold-soft">
                        {type}
                      </span>
                    </div>
                    {event.location && (
                      <p className="mt-4 text-sm text-mist/90">
                        Location: {event.location}
                      </p>
                    )}
                    {event.description && (
                      <p className="mt-3 text-sm leading-7 text-mist/85">
                        {event.description}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
