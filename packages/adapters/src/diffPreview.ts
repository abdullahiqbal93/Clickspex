const normalizeLines = (value: string): string[] => value.replaceAll("\r\n", "\n").split("\n");

export const createUnifiedDiff = (path: string, before: string, after: string): string => {
  if (before === after) {
    return "";
  }

  const beforeLines = normalizeLines(before);
  const afterLines = normalizeLines(after);
  let start = 0;

  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  ) {
    start += 1;
  }

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;

  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeLines[beforeEnd] === afterLines[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const contextStart = Math.max(0, start - 3);
  const contextEnd = Math.min(beforeLines.length - 1, beforeEnd + 3);
  const beforeContext = beforeLines.slice(contextStart, start).map((line) => ` ${line}`);
  const removed = beforeLines.slice(start, beforeEnd + 1).map((line) => `-${line}`);
  const added = afterLines.slice(start, afterEnd + 1).map((line) => `+${line}`);
  const afterContext = beforeLines.slice(beforeEnd + 1, contextEnd + 1).map((line) => ` ${line}`);

  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${contextStart + 1},${Math.max(1, contextEnd - contextStart + 1)} +${contextStart + 1},${Math.max(1, afterEnd - contextStart + 4)} @@`,
    ...beforeContext,
    ...removed,
    ...added,
    ...afterContext,
  ].join("\n");
};
