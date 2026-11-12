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
    const text = ErrorText(e);
    const match = redaction.Check(text);
    return match ? `[error withheld: ${match.Kind}]` : text;
}
