/**
 * Harness credential helpers. On lts/6.1 this file carries only the turn-output scrub from
 * `next` (#6639); the rest of the `next` resolver is not on this line.
 */

/** Placeholder substituted whenever a secret is scrubbed from harness turn output or error logs. */
export const HARNESS_REDACTED_SECRET_PLACEHOLDER = '[REDACTED_SECRET]';

const NON_SECRET_ENV_KEYS: ReadonlySet<string> = new Set([
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'LANG',
    'TERM',
    'GH_PROMPT_DISABLED',
    'GIT_TERMINAL_PROMPT',
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
    'DB_HOST',
    'DB_PORT',
    'DB_DATABASE',
    'DB_USER',
    'DB_USERNAME',
    'CODEGEN_DB_USER',
    'CODEGEN_DB_USERNAME',
]);

/**
 * Deterministically scrubs injected credential values, database passwords, CLI `-P` flags,
 * connection string passwords, and API/GitHub tokens from harness turn output or error strings
 * before they are persisted to `AIPromptRun` or replayed into subsequent LLM turns.
 */
export function ScrubHarnessSecrets(
    text: string | undefined,
    environment?: Readonly<Record<string, string>>,
): string {
    if (!text) {
        return '';
    }

    let scrubbed = text;

    if (environment) {
        const candidateValues: string[] = [];
        for (const [key, val] of Object.entries(environment)) {
            if (NON_SECRET_ENV_KEYS.has(key)) {
                continue;
            }
            const trimmed = val?.trim();
            if (trimmed && trimmed.length >= 6) {
                candidateValues.push(trimmed);
            }
        }
        candidateValues.sort((a, b) => b.length - a.length);
        for (const secret of candidateValues) {
            scrubbed = scrubbed.split(secret).join(HARNESS_REDACTED_SECRET_PLACEHOLDER);
        }
    }

    // safe-replace: constant placeholder, no $ sequences
    scrubbed = scrubbed.replace(
        /\b(Password|Pwd)\s*=\s*([^;'"\s]+)/gi,
        `$1=${HARNESS_REDACTED_SECRET_PLACEHOLDER}`,
    );
    // safe-replace: constant placeholder, no $ sequences
    scrubbed = scrubbed.replace(
        /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:@/\s]+:)([^@/\s]+)(@)/g,
        `$1${HARNESS_REDACTED_SECRET_PLACEHOLDER}$3`,
    );
    scrubbed = scrubbed.replace(
        /(?:^|\s)(-P|--password)(?:\s+|=)(\S+)/g,
        (match, flag: string) => {
            const leading = match.startsWith(' ') ? ' ' : '';
            return `${leading}${flag} ${HARNESS_REDACTED_SECRET_PLACEHOLDER}`;
        },
    );
    // safe-replace: constant placeholder, no $ sequences
    scrubbed = scrubbed.replace(
        /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*([^\r\n]+)/g,
        `$1=${HARNESS_REDACTED_SECRET_PLACEHOLDER}`,
    );
    // safe-replace: constant placeholder, no $ sequences
    scrubbed = scrubbed.replace(
        /\b(?:ghp_[A-Za-z0-9_]{16,}|ghs_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})\b/g,
        HARNESS_REDACTED_SECRET_PLACEHOLDER,
    );

    return scrubbed;
}
