import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface WorkspacePackage { Name: string; Dir: string; HasVitest: boolean; HasTests: boolean; }

/** Workspace packages by name and by directory, read from `pnpm-workspace.yaml` globs (`packages/*` and `packages/A/B/*` shapes only). */
export class PackageMap {
    private constructor(private readonly byName: Map<string, WorkspacePackage>, private readonly dirs: WorkspacePackage[]) {}

    public static Load(root: string): PackageMap {
        const globs = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n').map((l) => /^\s+-\s+'([^']+)'/.exec(l)?.[1]).filter((g): g is string => Boolean(g));
        const byName = new Map<string, WorkspacePackage>(); const dirs: WorkspacePackage[] = [];
        for (const g of globs) {
            const parent = join(root, g.replace(/\/\*$/, ''));
            if (!g.endsWith('/*') || !existsSync(parent)) continue;
            for (const entry of readdirSync(parent)) {
                const dir = join(parent, entry); const pj = join(dir, 'package.json');
                if (!statSync(dir).isDirectory() || !existsSync(pj)) continue;
                const name = (JSON.parse(readFileSync(pj, 'utf8')) as { name?: string }).name; if (!name) continue;
                const pkg: WorkspacePackage = { Name: name, Dir: relative(root, dir).split(sep).join('/'), HasVitest: existsSync(join(dir, 'vitest.config.ts')) || existsSync(join(dir, 'vitest.config.mts')), HasTests: hasTestFiles(join(dir, 'src')) };
                byName.set(name, pkg); dirs.push(pkg);
            }
        }
        dirs.sort((a, b) => b.Dir.length - a.Dir.length);              // longest prefix wins
        return new PackageMap(byName, dirs);
    }
    public PackageForPath(repoRelative: string): WorkspacePackage | null { return this.dirs.find((p) => repoRelative.startsWith(p.Dir + '/')) ?? null; }
    public Get(name: string): WorkspacePackage | null { return this.byName.get(name) ?? null; }
    public All(): WorkspacePackage[] { return [...this.dirs]; }
}

function hasTestFiles(dir: string): boolean {
    if (!existsSync(dir)) return false;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        if (e.isDirectory() && hasTestFiles(join(dir, e.name))) return true;
        if (e.isFile() && /\.test\.ts$/.test(e.name) && !/\.jit\.test\.ts$/.test(e.name)) return true;
    }
    return false;
}
