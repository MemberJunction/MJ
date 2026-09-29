/**
 * Turns a generated validator's text into source that can be written into a class.
 *
 * A model sometimes returns the whole function double-escaped, as one line with literal `\n`,
 * `\t` and `\"` sequences; those are turned into real characters. Text that already has real
 * line breaks is real source and is returned unchanged, because there those sequences are escapes
 * inside string and regular-expression literals, and turning them into characters breaks the code.
 */
export function NormalizeGeneratedValidatorText(functionText: string): string {
  if (functionText.includes('\n')) return functionText;
  return functionText.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
}
