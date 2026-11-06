import { randomUUID } from 'node:crypto';

/** `YYYYMMDD-HHMMSS-pr<n>-<head7>`; `local` when there is no PR. */
export function NewRunID(prNumber: number | null, headSHA: string, now: Date = new Date()): string {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    return `${stamp}-${prNumber === null ? 'local' : `pr${prNumber}`}-${headSHA.slice(0, 7)}`;
}
export function NewID(): string { return randomUUID(); }
/** True when the ID can be used as a file name component with no path meaning. */
export function IsSafeFileID(id: string): boolean { return /^[0-9a-f-]{36}$/.test(id); }
