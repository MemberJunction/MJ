export type RedactionMatch = { Kind: 'KnownSecret' | 'KeyPattern'; Excerpt: string };

export class RedactionError extends Error {
    constructor(public readonly Match: RedactionMatch, what: string) { super(`refusing to write ${what}: ${Match.Kind} found (${Match.Excerpt})`); }
}

/** Patterns of vendor keys and tokens that must never leave the job, whatever the known-secret list says. */
const KEY_PATTERNS: { Name: string; Pattern: RegExp }[] = [
    { Name: 'anthropic', Pattern: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{20,}/ },
    { Name: 'openai', Pattern: /(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
    { Name: 'google', Pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/ },
    { Name: 'github', Pattern: /(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/ },
    { Name: 'aws', Pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}/ },
    { Name: 'turbo', Pattern: /TURBO_TOKEN=\S+/ },
    { Name: 'actions', Pattern: /ACTIONS_RUNTIME_TOKEN=\S+/ },
];

/** Scans outgoing text for secret values before it is written to an artifact, the store or a comment (D32). */
export class RedactionCheck {
    private readonly secrets: string[];
    constructor(secretValues: string[]) { this.secrets = secretValues.filter((s) => s.length >= 8); }

    public Check(text: string): RedactionMatch | null {
        for (const s of this.secrets) {
            const i = text.indexOf(s);
            if (i >= 0) return { Kind: 'KnownSecret', Excerpt: this.excerpt(text, i, s.length) };
        }
        for (const { Name, Pattern } of KEY_PATTERNS) {
            const m = Pattern.exec(text);
            if (m) return { Kind: 'KeyPattern', Excerpt: `${Name}: ${this.excerpt(text, m.index, m[0].length)}` };
        }
        return null;
    }

    public AssertClean(text: string, what: string): void {
        const m = this.Check(text);
        if (m) throw new RedactionError(m, what);
    }

    /** Context around the match with the match itself replaced, so the excerpt can be logged. */
    private excerpt(text: string, index: number, length: number): string {
        const before = text.slice(Math.max(0, index - 12), index);
        const after = text.slice(index + length, index + length + 12);
        return `${before}[REDACTED ${length} chars]${after}`.replace(/\s+/g, ' ');
    }
}

/** The secret values this process holds, read from the environment names the jobs use. */
export function SecretsFromEnvironment(env: NodeJS.ProcessEnv = process.env): string[] {
    return ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'TURBO_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN']
        .map((n) => env[n] ?? '').filter((v) => v.length > 0);
}

/**
 * The last 2000 characters of `text` with this process's secret values replaced. Text that still matches a
 * key pattern is withheld as a whole.
 */
export function RedactTail(text: string): string {
    let out = text.slice(-2000);
    for (const secret of SecretsFromEnvironment()) out = out.split(secret).join('[REDACTED]');
    const match = new RedactionCheck([]).Check(out);
    return match ? `[output withheld: ${match.Kind}]` : out;
}

const MARKER_RE = /<<<[^>]*>>>/g;
const MARKER_PLACEHOLDER = '[marker removed]';

/** Replaces every `<<<...>>>` marker in untrusted text with `[marker removed]`, so the text cannot open or close an untrusted block. */
export function NeutraliseMarkers(text: string | null | undefined): string { return (text ?? '').replace(MARKER_RE, MARKER_PLACEHOLDER); }
