/**
 * Renders a value for one-line console logging without Node's `[Object]` truncation.
 * Arrays keep their structure; non-array objects collapse to JSON, truncated at `maxLen`.
 * Objects whose JSON exceeds `maxLen` and contain nested structure are recursed into so
 * outer keys remain visible.
 */
export function shortenForLog(value: unknown, maxLen = 300): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => shortenForLog(v, maxLen));
  const json = JSON.stringify(value);
  if (json.length <= maxLen) return json;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = shortenForLog(v, maxLen);
  }
  return result;
}
