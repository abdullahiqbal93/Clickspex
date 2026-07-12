export type CssDeclaration = {
  property: string;
  value: string;
  enabled: boolean;
};

const parseDeclaration = (fragment: string, enabled: boolean): CssDeclaration | null => {
  const normalized = fragment.trim().replace(/;+\s*$/, "");
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "(" || character === "[") {
      depth += 1;
      continue;
    }

    if (character === ")" || character === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (character === ":" && depth === 0) {
      return {
        property: normalized.slice(0, index).trim(),
        value: normalized.slice(index + 1).trim(),
        enabled,
      };
    }
  }

  return normalized.length === 0 ? null : { property: normalized, value: "", enabled };
};

const readEnabledDeclaration = (
  css: string,
  start: number,
): { declaration: CssDeclaration | null; nextIndex: number } => {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;
  let index = start;

  for (; index < css.length; index += 1) {
    const character = css[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "(" || character === "[") {
      depth += 1;
      continue;
    }

    if (character === ")" || character === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (character === ";" && depth === 0) {
      break;
    }
  }

  return {
    declaration: parseDeclaration(css.slice(start, index), true),
    nextIndex: index < css.length ? index + 1 : index,
  };
};

export const parseCssDeclarations = (css: string): CssDeclaration[] => {
  const declarations: CssDeclaration[] = [];
  let index = 0;

  while (index < css.length) {
    while (/\s/.test(css[index] ?? "")) {
      index += 1;
    }

    if (index >= css.length) {
      break;
    }

    if (css.startsWith("/*", index)) {
      const commentEnd = css.indexOf("*/", index + 2);
      const end = commentEnd < 0 ? css.length : commentEnd;
      const declaration = parseDeclaration(css.slice(index + 2, end), false);

      if (declaration !== null && declaration.property.length > 0) {
        declarations.push(declaration);
      }

      index = commentEnd < 0 ? css.length : commentEnd + 2;
      continue;
    }

    const result = readEnabledDeclaration(css, index);
    if (result.declaration !== null) {
      declarations.push(result.declaration);
    }
    index = result.nextIndex;
  }

  return declarations;
};

export const serializeCssDeclarations = (declarations: readonly CssDeclaration[]): string =>
  declarations
    .filter(
      (declaration) =>
        declaration.property.trim().length > 0 || declaration.value.trim().length > 0,
    )
    .map((declaration) => {
      const text = `${declaration.property.trim()}: ${declaration.value.trim()};`;
      return declaration.enabled ? text : `/* ${text} */`;
    })
    .join("\n");

const withoutImportant = (value: string): string => value.replace(/\s*!important\s*$/i, "").trim();

export const isCssDeclarationValid = (declaration: CssDeclaration): boolean => {
  const property = declaration.property.trim();
  const value = withoutImportant(declaration.value);

  if (!/^(?:--[\w-]+|-?[a-z][\w-]*)$/i.test(property) || value.length === 0) {
    return false;
  }

  if (
    property.startsWith("--") ||
    typeof CSS === "undefined" ||
    typeof CSS.supports !== "function"
  ) {
    return true;
  }

  return CSS.supports(property, value);
};

export const buildImportantCssDeclarations = (css: string): string =>
  parseCssDeclarations(css)
    .filter(
      (declaration) =>
        declaration.enabled &&
        declaration.property.trim().length > 0 &&
        declaration.value.trim().length > 0,
    )
    .map((declaration) => {
      const value = declaration.value.trim();
      const importantValue = /!important\s*$/i.test(value) ? value : `${value} !important`;
      return `  ${declaration.property.trim()}: ${importantValue};`;
    })
    .join("\n");
