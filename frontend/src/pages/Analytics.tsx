import { useEffect, useState } from "react";
import api from "../services/api";

interface Highlight {
  title: string;
  value: string;
  caption: string;
}

const fallbackHighlights: Highlight[] = [
  { title: "Retention Rate", value: "93%", caption: "Last 6 months" },
  { title: "Attendance", value: "87%", caption: "Average monthly" },
  { title: "Volunteer Reach", value: "1,420", caption: "People served" },
];

function parseHighlights(payload: unknown): Highlight[] {
  if (!payload || typeof payload !== "object") return [];

  const source = (payload as { data?: unknown }).data ?? payload;
  if (!source || typeof source !== "object") return [];

  const obj = source as Record<string, unknown>;
  const retention = Number(obj.retention_rate ?? obj.retention ?? NaN);
  const attendance = Number(obj.attendance_rate ?? obj.attendance ?? NaN);
  const reach = Number(obj.volunteer_reach ?? obj.people_served ?? NaN);

  const rows: Highlight[] = [];

  if (Number.isFinite(retention)) {
    rows.push({
      title: "Retention Rate",
      value: `${retention}%`,
      caption: "Last 6 months",
    });
  }

  if (Number.isFinite(attendance)) {
    rows.push({
      title: "Attendance",
      value: `${attendance}%`,
      caption: "Average monthly",
    });
  }

  if (Number.isFinite(reach)) {
    rows.push({
      title: "Volunteer Reach",
      value: reach.toLocaleString(),
      caption: "People served",
    });
  }

  return rows;
}

export default function Analytics() {
  const [highlights, setHighlights] = useState<Highlight[]>(fallbackHighlights);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/analytics");
        const parsed = parseHighlights(res.data);

        if (!mounted) return;

        if (parsed.length > 0) {
          setHighlights(parsed);
          setNotice("");
        } else {
          setHighlights(fallbackHighlights);
          setNotice("Live analytics schema is incomplete. Showing fallback metrics.");
        }
      } catch {
        if (!mounted) return;
        setHighlights(fallbackHighlights);
        setNotice("Live analytics endpoint unavailable. Showing fallback metrics.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Analytics</h1>
      <p className="mb-6 text-sm text-mist/85">
        Performance indicators for membership and outreach impact.
      </p>

      {notice && (
        <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-xs text-gold-soft">
          {notice}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {loading && fallbackHighlights.map((item) => (
          <article key={`loading-${item.title}`} className="rounded-xl border border-white/20 bg-white/10 p-6">
            <p className="text-xs uppercase tracking-wide text-gold-soft">{item.title}</p>
            <p className="mt-2 font-heading text-4xl text-offwhite/70">...</p>
            <p className="mt-1 text-sm text-mist/80">Loading</p>
          </article>
        ))}

        {!loading && highlights.map((item) => (
          <article key={item.title} className="card-lift rounded-xl border border-white/20 bg-white/10 p-6">
            <p className="text-xs uppercase tracking-wide text-gold-soft">{item.title}</p>
            <p className="mt-2 font-heading text-4xl text-offwhite">{item.value}</p>
            <p className="mt-1 text-sm text-mist/80">{item.caption}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
