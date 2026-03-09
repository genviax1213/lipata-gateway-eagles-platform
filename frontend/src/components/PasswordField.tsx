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
        👁️
      </button>
    </div>
  );
}
