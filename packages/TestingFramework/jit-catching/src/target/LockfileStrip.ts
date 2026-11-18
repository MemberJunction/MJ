/**
 * Removes pnpm patch information from lockfile text: the top-level `patchedDependencies:` block and every
 * `(patch_hash=…)` segment in keys and version strings. The host fetches with this copy, so it needs no patch file (D35).
 */
export function StripPatchInfo(lockfile: string): string {
    const out: string[] = []; let inBlock = false;
    for (const line of lockfile.split('\n')) {
        if (/^patchedDependencies:\s*$/.test(line)) { inBlock = true; continue; }
        if (inBlock) { if (line === '' || /^\s/.test(line)) continue; inBlock = false; }
        out.push(line.replace(/\(patch_hash=[^)]*\)/g, ''));
    }
    const text = out.join('\n');
    if (/patch_hash=|^patchedDependencies:/m.test(text)) throw new Error('lockfile still holds patch information after stripping');
    return text;
}
