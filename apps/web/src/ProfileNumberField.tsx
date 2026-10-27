import { useEffect, useState } from 'react';
import { KeyboardTextField } from './OnScreenKeyboard';
import { profileNumericInput } from './profileNumericInput';

export function ProfileNumberField({
  label,
  value,
  onChange,
  min,
  max,
  integer = true,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  integer?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  useEffect(() => {
    // Keep unfinished input visible; external changes (mode conversion) still update the field.
    if (Number.isFinite(value))
      setText((current) =>
        profileNumericInput(current, min, max, integer) === value
          ? current
          : String(value),
      );
  }, [value, min, max, integer]);
  const error = !Number.isFinite(profileNumericInput(text, min, max, integer));
  const range =
    min === max
      ? `${min} с — начальная точка`
      : `${min}–${max}${integer ? ', целое число' : ' °C'}`;
  return (
    <KeyboardTextField
      label={label}
      type="number"
      integerOnly={integer}
      value={text}
      disabled={disabled}
      error={error}
      helperText={error ? `Допустимо: ${range}` : undefined}
      onChange={(next) => {
        setText(next);
        onChange(profileNumericInput(next, min, max, integer));
      }}
    />
  );
}
