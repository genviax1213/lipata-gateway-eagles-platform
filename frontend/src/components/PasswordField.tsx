import { useId, useState } from "react";

type PasswordFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

export default function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  required,
  disabled,
  className,
  ariaLabel,
}: PasswordFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-mist/80 transition hover:text-offwhite"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
            <path d="M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.88 5.09A9.77 9.77 0 0 1 12 4.8c4.48 0 8.27 2.94 9.54 7.2a10.66 10.66 0 0 1-3.06 4.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6.61 6.61A10.7 10.7 0 0 0 2.46 12c1.27 4.26 5.06 7.2 9.54 7.2 1.61 0 3.13-.37 4.48-1.02" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
            <path d="M2.46 12c1.27-4.26 5.06-7.2 9.54-7.2s8.27 2.94 9.54 7.2c-1.27 4.26-5.06 7.2-9.54 7.2S3.73 16.26 2.46 12Z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
