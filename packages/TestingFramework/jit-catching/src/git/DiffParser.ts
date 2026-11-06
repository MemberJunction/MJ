import type { DiffHunk } from '../types';

const FILE_RE = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/;
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parses `git diff` output into hunks. Lines keep their leading `+`, `-` or space. */
export function ParseUnifiedDiff(text: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let path: string | null = null; let current: DiffHunk | null = null;
    for (const line of text.split('\n')) {
        const f = FILE_RE.exec(line);
        if (f) { path = f[1] ?? null; current = null; continue; }
        const h = HUNK_RE.exec(line);
        if (h && path) {
            current = { Path: path, OldStart: Number(h[1]), OldLines: h[2] === undefined ? 1 : Number(h[2]), NewStart: Number(h[3]), NewLines: h[4] === undefined ? 1 : Number(h[4]), Lines: [] };
            hunks.push(current); continue;
        }
        if (current && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) current.Lines.push(line);
        else if (current && line.startsWith('\\')) continue;            // "\ No newline at end of file"
        else if (line.startsWith('diff --git')) { current = null; path = null; }
    }
    return hunks;
}

/** New-side line numbers of every added line, per file. */
export function AddedLinesByFile(hunks: DiffHunk[]): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const h of hunks) {
        let n = h.NewStart;
        for (const l of h.Lines) {
            if (l.startsWith('+')) { (out[h.Path] ??= []).push(n); n++; }
            else if (l.startsWith(' ')) n++;
        }
    }
    return out;
}
