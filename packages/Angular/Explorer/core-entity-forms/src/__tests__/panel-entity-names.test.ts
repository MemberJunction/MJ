import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every entity name a compiled form panel queries must be a real, registered entity name.
 * An unknown name makes `RunView` throw `Entity ... not found in metadata` at runtime, so the
 * panel cannot load its data on any form it mounts on.
 *
 * The same holds for the `entity` a panel registers against in `@RegisterClassEx` metadata:
 * the slot host matches it exactly against the form's entity name, so an unknown name never
 * mounts. The `'*'` wildcard (every entity's form) is allowed.
 *
 * The scan reads every `.ts` file under `src/lib` that registers a panel
 * (`RegisterClassEx(BaseFormPanel`), whatever the file is named. Test files (`*.test.ts`)
 * are left out.
 *
 * The registered names are read from the generated core entity classes
 * (`@RegisterClass(BaseEntity, 'MJ: ...')` in `MJCoreEntities/src/generated/entities/__mj.ts`).
 */
const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, '..', 'lib');
const generatedEntitiesFile = join(here, '..', '..', '..', '..', '..', 'MJCoreEntities', 'src', 'generated', 'entities', '__mj.ts');

/** The `.ts` files under `dir`, test files excluded, that register a form panel. */
function panelFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return panelFiles(full);
        if (!name.endsWith('.ts') || name.endsWith('.test.ts')) return [];
        return readFileSync(full, 'utf8').includes('RegisterClassEx(BaseFormPanel') ? [full] : [];
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

/** `entity: '...'` literals in registration metadata, without the `'*'` wildcard. */
function registrationEntityLiterals(source: string): string[] {
    return [...source.matchAll(/\bentity\s*:\s*(['"`])([^'"`$]+)\1/g)].map((m) => m[2]).filter((name) => name !== '*');
}

interface EntityNameUsage {
    File: string;
    Kind: 'query' | 'registration';
    Name: string;
}

describe('entity names queried by compiled form panels', () => {
    const registered = registeredEntityNames();
    const usages: EntityNameUsage[] = panelFiles(libDir).flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const at = relative(libDir, file);
        return [
            ...entityNameLiterals(source).map((name): EntityNameUsage => ({ File: at, Kind: 'query', Name: name })),
            ...registrationEntityLiterals(source).map((name): EntityNameUsage => ({ File: at, Kind: 'registration', Name: name })),
        ];
    });

    it('reads the generated entity names and the panel files', () => {
        expect(registered.size).toBeGreaterThan(300);
        expect(registered.has('MJ: Employees')).toBe(true);
        expect(panelFiles(libDir).length).toBeGreaterThanOrEqual(21);
    });

    it('finds the overview panel queries', () => {
        const files = new Set(usages.filter((u) => u.Kind === 'query').map((u) => u.File));
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

    it('finds the panel registrations, also in files not named *.panel.ts', () => {
        const registrations = usages.filter((u) => u.Kind === 'registration');
        expect(registrations.length).toBeGreaterThanOrEqual(41);
        expect(registrations).toContainEqual({ File: 'custom/Companies/company-overview.panel.ts', Kind: 'registration', Name: 'MJ: Companies' });
        expect(registrations).toContainEqual({ File: 'custom/HierarchyPanels/hierarchy-form-panels.ts', Kind: 'registration', Name: 'MJ: AI Agent Categories' });
        expect(registrations).toContainEqual({ File: 'panels/ai-skill-sharing/ai-skill-sharing-panel.component.ts', Kind: 'registration', Name: 'MJ: AI Skills' });
    });

    it('leaves test files out of the scan', () => {
        const dir = mkdtempSync(join(tmpdir(), 'panel-files-'));
        try {
            const registration = "@RegisterClassEx(BaseFormPanel, { entity: 'MJ: Not A Real Entity' })";
            writeFileSync(join(dir, 'sample.panel.ts'), registration);
            writeFileSync(join(dir, 'sample.panel.dom.test.ts'), registration);
            writeFileSync(join(dir, 'sample.panel.test.ts'), registration);
            expect(panelFiles(dir).map((file) => relative(dir, file))).toEqual(['sample.panel.ts']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('uses only MJ:-prefixed names', () => {
        const unprefixed = usages.filter((u) => !u.Name.startsWith('MJ: '));
        expect(unprefixed).toEqual([]);
    });

    it('uses only names registered in the generated entity classes', () => {
        const unknown = usages.filter((u) => !registered.has(u.Name));
        expect(unknown).toEqual([]);
    });
});
