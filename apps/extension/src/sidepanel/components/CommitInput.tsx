import { useEffect, useRef, useState } from "react";

type CommitInputProps = {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

/**
 * Text input that previews changes as the user types.
 *
 * The style injector coalesces rapid edits of the same property, so live typing
 * still behaves like one continuous edit for undo/history in normal use.
 */
export const CommitInput = ({ value, onCommit, ...rest }: CommitInputProps) => {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const focusBaselineRef = useRef(value);

  useEffect(() => {
    if (!focused) {
      setDraft(value);
      focusBaselineRef.current = value;
    }
  }, [value, focused]);

  const previewValue = (nextValue: string, forceCommit = false) => {
    setDraft(nextValue);
    if (forceCommit || nextValue !== value) {
      onCommit(nextValue);
    }
  };

  return (
    <input
      {...rest}
      onBlur={() => setFocused(false)}
      onChange={(event) => previewValue(event.target.value)}
      onFocus={() => {
        focusBaselineRef.current = value;
        setFocused(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          previewValue(focusBaselineRef.current, true);
          event.currentTarget.blur();
        }
      }}
      value={draft}
    />
  );
};
