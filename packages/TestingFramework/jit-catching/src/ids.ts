import { createHash, randomUUID } from 'node:crypto';

/** `YYYYMMDD-HHMMSS-pr<n>-<head7>`; `local` when there is no PR. */
export function NewRunID(prNumber: number | null, headSHA: string, now: Date = new Date()): string {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    return `${stamp}-${prNumber === null ? 'local' : `pr${prNumber}`}-${headSHA.slice(0, 7)}`;
}
export function NewID(): string { return randomUUID(); }
/** True when the ID can be used as a file name component with no path meaning. */
export function IsSafeFileID(id: string): boolean { return /^[0-9a-f-]{36}$/.test(id); }
/** A UUID-shaped ID derived from `parts`; the same parts always give the same ID. */
export function StableID(...parts: string[]): string {
    const h = createHash('sha256').update(parts.join('\u0000')).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
