import { RedactTail, type RedactionCheck } from '../sandbox/Redaction';

/** Characters of an error's redacted text kept in the ledger and on stdout. */
const ERROR_TEXT_CHARS = 2000;

/** The redacted message without stack frames, cut to its last ERROR_TEXT_CHARS characters. */
export function ErrorText(e: unknown): string {
    const message = e instanceof Error ? e.message : String(e);
    const lines = message.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('at '));
    return RedactTail((lines.join('\n') || 'failed').slice(-ERROR_TEXT_CHARS));
}

/** `ErrorText`, withheld when it still holds a secret the redaction check knows. */
export function ErrorLine(e: unknown, redaction: RedactionCheck): string {
    return withheld(ErrorText(e), redaction);
}

/** Characters of an error's first line kept on stderr. */
const FIRST_LINE_CHARS = 200;

/** The first non-empty line of the error's message, redacted and withheld like `ErrorLine`, then cut to FIRST_LINE_CHARS. */
export function ErrorFirstLine(e: unknown, redaction: RedactionCheck): string {
    const message = e instanceof Error ? e.message : String(e);
    const line = message.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'failed';
    return withheld(RedactTail(line.slice(-ERROR_TEXT_CHARS)), redaction).slice(0, FIRST_LINE_CHARS);
}

/** `text`, or a placeholder naming the kind of secret the redaction check still finds in it. */
function withheld(text: string, redaction: RedactionCheck): string {
    const match = redaction.Check(text);
    return match ? `[error withheld: ${match.Kind}]` : text;
}
