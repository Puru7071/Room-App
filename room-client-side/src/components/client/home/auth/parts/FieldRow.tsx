"use client";

import {
  authFieldColumn,
  authInputFieldStack,
  cellField,
  cellInput,
  fieldErrorAbsolute,
} from "../styles";

type FieldRowProps = {
  id: string;
  name: string;
  /** Visible-only-to-screen-readers label. */
  label: string;
  type?: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  /**
   * Optional trailing element rendered inside the `cellField` chrome to the
   * right of the input — used by the password rows to host the eye toggle.
   * When provided, the field becomes a flex row; the input takes flex-1.
   */
  trailing?: React.ReactNode;
};

/**
 * A single labelled input plus an absolute-positioned error slot. The error
 * slot is reserved by the parent's `pb-7` so showing/hiding the message
 * doesn't shift surrounding layout.
 */
export function FieldRow({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  trailing,
}: FieldRowProps) {
  const errorId = `${id}-err`;
  const fieldClass = trailing ? `${cellField} flex items-center` : cellField;
  const inputClass = trailing ? `${cellInput} flex-1` : cellInput;
  return (
    <div className={authFieldColumn}>
      <div className={authInputFieldStack}>
        <div className={fieldClass}>
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <input
            id={id}
            name={name}
            type={type}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {trailing}
        </div>
        {error ? (
          <p id={errorId} className={fieldErrorAbsolute} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
