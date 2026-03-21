const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);

function neutralizeSpreadsheetFormula(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed !== "" && FORMULA_PREFIXES.has(trimmed[0] ?? "")) {
    return `'${text}`;
  }

  return text;
}

export function toSafeCsvCell(value: string | number | null | undefined): string {
  const safeText = neutralizeSpreadsheetFormula(String(value ?? "")).replace(/"/g, '""');
  return `"${safeText}"`;
}

export function buildCsvContent(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map((value) => toSafeCsvCell(value)).join(",")).join("\n");
}
