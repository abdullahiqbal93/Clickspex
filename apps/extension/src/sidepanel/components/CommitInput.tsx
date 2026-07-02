import { useEffect, useState } from "react";

type CommitInputProps = {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

/**
 * Text input that commits on blur or Enter instead of every keystroke.
 *
 * Committing per keystroke floods the style-change history (typing "100px"
 * produced four separate undo entries) and applies broken intermediate
 * values like "1" and "10" to the live page.
 */
export const CommitInput = ({ value, onCommit, ...rest }: CommitInputProps) => {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(value);
    }
  }, [value, focused]);

  return (
    <input
      {...rest}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      value={draft}
    />
  );
};
