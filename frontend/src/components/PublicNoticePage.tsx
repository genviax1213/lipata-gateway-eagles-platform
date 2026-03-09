interface PublicNoticePageProps {
  eyebrow: string;
  title: string;
  message: string;
}

export default function PublicNoticePage({ eyebrow, title, message }: PublicNoticePageProps) {
  return (
    <section className="section-wrap py-16 md:py-20">
      <div className="surface-card card-lift max-w-4xl p-8 md:p-12">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">{eyebrow}</p>
        <h1 className="mb-4 font-heading text-4xl text-offwhite md:text-5xl">{title}</h1>
        <p className="max-w-3xl text-base leading-relaxed text-mist/90 md:text-lg">
          {message}
        </p>
      </div>
    </section>
  );
}
