interface BottomSectionProps {
  compact?: boolean;
}

export default function BottomSection({ compact = false }: BottomSectionProps) {
  return (
    <section className={compact ? "section-wrap pb-8 pt-6" : "section-wrap pb-12 pt-10"}>
      <div className="surface-card card-lift p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-soft">
          Community
        </p>
        <h3 className="mt-2 font-heading text-3xl text-offwhite md:text-4xl">
          Stay Connected With LGEC
        </h3>
        <p className="mt-3 max-w-3xl text-sm text-mist/90 md:text-base">
          Participate in upcoming activities, outreach programs, and club updates.
          This section appears across all pages for quick access to important club information.
        </p>
      </div>
    </section>
  );
}
