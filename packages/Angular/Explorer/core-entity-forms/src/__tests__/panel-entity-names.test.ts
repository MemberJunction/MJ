import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every entity name a compiled form panel queries must be a real, registered entity name.
 * An unknown name makes `RunView` throw `Entity ... not found in metadata` at runtime, so the
 * panel cannot load its data on any form it mounts on.
 *
 * The registered names are read from the generated core entity classes
 * (`@RegisterClass(BaseEntity, 'MJ: ...')` in `MJCoreEntities/src/generated/entities/__mj.ts`).
 */
const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, '..', 'lib');
const generatedEntitiesFile = join(here, '..', '..', '..', '..', '..', 'MJCoreEntities', 'src', 'generated', 'entities', '__mj.ts');

function panelFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return panelFiles(full);
        return name.endsWith('.panel.ts') ? [full] : [];
    });
}

/** Names registered as core entity classes. */
function registeredEntityNames(): Set<string> {
    const source = readFileSync(generatedEntitiesFile, 'utf8');
    return new Set([...source.matchAll(/@RegisterClass\(BaseEntity,\s*'([^']+)'\)/g)].map((m) => m[1]));
}

/**
 * String literals used as an entity name: `EntityName: '...'` (RunView / RunViews params)
 * and the first argument of `OpenEntityRecord('...')` / `GetEntityObject('...')`.
 */
function entityNameLiterals(source: string): string[] {
    const patterns = [
        /\bEntityName\s*:\s*(['"`])([^'"`$]+)\1/g,
        /\b(?:OpenEntityRecord|GetEntityObject)\s*(?:<[^>]*>)?\(\s*(['"`])([^'"`$]+)\1/g,
    ];
    return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((m) => m[2]));
}

describe('entity names queried by compiled form panels', () => {
    const registered = registeredEntityNames();
    const usages = panelFiles(libDir).flatMap((file) =>
        entityNameLiterals(readFileSync(file, 'utf8')).map((name) => ({ file: relative(libDir, file), name })),
    );

    it('reads the generated entity names and the panel files', () => {
        expect(registered.size).toBeGreaterThan(300);
        expect(registered.has('MJ: Employees')).toBe(true);
        expect(panelFiles(libDir).length).toBeGreaterThanOrEqual(15);
    });

    it('finds the overview panel queries', () => {
        const files = new Set(usages.map((u) => u.file));
        for (const file of [
            'custom/Companies/company-overview.panel.ts',
            'custom/Employees/employee-overview.panel.ts',
            'custom/Conversations/conversation-overview.panel.ts',
            'custom/AIAgentCategories/ai-agent-category-overview.panel.ts',
            'custom/Users/user-overview.panel.ts',
            'panels/ai-agents/agent-realtime.panel.ts',
        ]) {
            expect(files.has(file), file).toBe(true);
        }
    });

    it('uses only MJ:-prefixed names', () => {
        const unprefixed = usages.filter((u) => !u.name.startsWith('MJ: '));
        expect(unprefixed).toEqual([]);
    });

    it('uses only names registered in the generated entity classes', () => {
        const unknown = usages.filter((u) => !registered.has(u.name));
        expect(unknown).toEqual([]);
    });
});
