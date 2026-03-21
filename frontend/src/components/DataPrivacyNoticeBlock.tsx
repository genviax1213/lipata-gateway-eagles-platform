import { dataPrivacyNoticeCopy } from "../content/dataPrivacyNotice";

interface DataPrivacyNoticeBlockProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function DataPrivacyNoticeBlock({
  checked,
  onChange,
  disabled = false,
  compact = false,
}: DataPrivacyNoticeBlockProps) {
  return (
    <div className={`rounded-xl border border-white/20 bg-white/5 ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-soft/90">
        <span>Effective Date: {dataPrivacyNoticeCopy.effectiveDate}</span>
        <span>Applies to: {dataPrivacyNoticeCopy.appliesTo}</span>
        <span>Scope: {dataPrivacyNoticeCopy.scope}</span>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-gold-soft">
        {dataPrivacyNoticeCopy.eyebrow}
      </p>
      <h3 className="mt-3 font-heading text-2xl text-offwhite">{dataPrivacyNoticeCopy.title}</h3>
      <p className="mt-3 text-sm text-mist/85">{dataPrivacyNoticeCopy.intro}</p>
      <div className="mt-4 space-y-3 text-sm leading-6 text-offwhite/90">
        {dataPrivacyNoticeCopy.sections.map((section) => (
          <p key={section}>{section}</p>
        ))}
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-lg border border-gold/20 bg-ink/35 px-4 py-3 text-sm text-offwhite">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-gold"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{dataPrivacyNoticeCopy.checkboxLabel}</span>
      </label>
    </div>
  );
}
