/**
 * Tests for applyOpenAppClientBootstrapBlock — the pure transform behind
 * `mj codegen manifest --open-app-client-bootstrap`. It refreshes a delimited block of
 * REFERENCED namespace imports (one per Open App client package in mj.config
 * dynamicPackages.client) at the end of MJExplorer's class-registrations manifest, so
 * the client load mechanism lives in distributed packages rather than a bespoke
 * MJExplorer file. Namespace imports (not bare `import '<pkg>'`) are used so the
 * @RegisterClass side effects survive production tree-shaking even when a package
 * declares "sideEffects": false.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { applyOpenAppClientBootstrapBlock } from '../commands/codegen/manifest.js';

const BASE = `// generated manifest\nexport const CLASS_REGISTRATIONS = [];\n`;

/** TS4111 — "Property ... comes from an index signature, so it must be accessed with [...]". */
const TS_PROPERTY_FROM_INDEX_SIGNATURE = 4111;

/**
 * Type-check generated manifest text the way a CONSUMER compiles it.
 *
 * This generator's output is compiled by a *different* package under a *different*
 * tsconfig — MJExplorer sets `noPropertyAccessFromIndexSignature: true`. A string
 * assertion over generated code cannot catch a type error in that code, so the only
 * sound check is to actually compile it under the consumer's strictness.
 *
 * The manifest imports Open App packages that do not exist in this test, so module
 * resolution is disabled and callers assert on specific diagnostic codes rather than
 * on an empty diagnostic list.
 */
function typeCheckAsConsumer(source: string): ts.Diagnostic[] {
    const fileName = '/generated-manifest.ts';
    const options: ts.CompilerOptions = {
        strict: true,
        noPropertyAccessFromIndexSignature: true,
        noResolve: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
    };
    const libFileName = ts.getDefaultLibFilePath(options);
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
    const host: ts.CompilerHost = {
        getSourceFile: (name) => {
            if (name === fileName) return sourceFile;
            const text = ts.sys.readFile(name);
            return text === undefined ? undefined : ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true);
        },
        writeFile: () => undefined,
        getDefaultLibFileName: () => libFileName,
        useCaseSensitiveFileNames: () => true,
        getCanonicalFileName: (n) => n,
        getCurrentDirectory: () => '/',
        getNewLine: () => '\n',
        fileExists: (name) => name === fileName || ts.sys.fileExists(name),
        readFile: (name) => (name === fileName ? source : ts.sys.readFile(name)),
    };
    const program = ts.createProgram([fileName], options, host);
    return [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)];
}

describe('applyOpenAppClientBootstrapBlock', () => {
    it('appends a referenced namespace import per enabled client package in a delimited block', () => {
        const out = applyOpenAppClientBootstrapBlock(BASE, [
            { PackageName: '@acme/a-ng', Enabled: true },
            { PackageName: '@acme/b-ng', Enabled: true },
        ]);
        // Namespace imports, not bare side-effect imports (which sideEffects:false would drop).
        expect(out).toContain("import * as __openAppClient0 from '@acme/a-ng';");
        expect(out).toContain("import * as __openAppClient1 from '@acme/b-ng';");
        expect(out).not.toContain("import '@acme/a-ng';");
        // The anchor: exported array references every namespace + observable global assignment.
        expect(out).toContain('export const OPEN_APP_CLIENT_MODULES: unknown[] = [__openAppClient0, __openAppClient1];');
        expect(out).toContain("(globalThis as Record<string, unknown>)['__mjOpenAppClientModules'] = OPEN_APP_CLIENT_MODULES;");
        // Regression guard: dot access on this index-signature property is TS4111 in any consumer
        // compiling with `noPropertyAccessFromIndexSignature` — MJExplorer does.
        expect(out).not.toContain(').__mjOpenAppClientModules');
        // No `any` and therefore no eslint escape hatch in generated output.
        expect(out).not.toContain('any');
        expect(out).not.toContain('eslint-disable');
        expect(out).toContain('BEGIN Open App client bootstrap');
        expect(out).toContain('END Open App client bootstrap');
        // Original manifest content is preserved.
        expect(out).toContain('export const CLASS_REGISTRATIONS = [];');
    });

    it('emits output that type-checks under a consumer using noPropertyAccessFromIndexSignature', () => {
        // MJExplorer compiles this generated file with `noPropertyAccessFromIndexSignature: true`
        // (packages/MJExplorer/tsconfig.json). Dot access on the `Record<string, unknown>` cast is
        // TS4111 there, which fails the Explorer build and emits zero JS whenever an Open App exists.
        const out = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/a-ng', Enabled: true }]);
        const violations = typeCheckAsConsumer(out)
            .filter((d) => d.code === TS_PROPERTY_FROM_INDEX_SIGNATURE)
            .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
        expect(violations).toEqual([]);
    });

    it('emits a disabled package as a comment, not an import', () => {
        const out = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/a-ng', Enabled: false }]);
        expect(out).not.toContain("from '@acme/a-ng'");
        expect(out).toContain("// '@acme/a-ng' disabled by");
    });

    it('is idempotent — applying the same entries twice yields identical content', () => {
        const entries = [{ PackageName: '@acme/a-ng', Enabled: true }];
        const once = applyOpenAppClientBootstrapBlock(BASE, entries);
        const twice = applyOpenAppClientBootstrapBlock(once, entries);
        expect(twice).toBe(once);
    });

    it('replaces a stale block when the entry set changes (no leftover imports)', () => {
        const first = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/old-ng', Enabled: true }]);
        const second = applyOpenAppClientBootstrapBlock(first, [{ PackageName: '@acme/new-ng', Enabled: true }]);
        expect(second).toContain("import * as __openAppClient0 from '@acme/new-ng';");
        expect(second).not.toContain('@acme/old-ng');
        // Exactly one managed block.
        expect(second.match(/BEGIN Open App client bootstrap/g)?.length).toBe(1);
    });

    it('removes the block entirely when there are no client entries', () => {
        const withBlock = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/a-ng', Enabled: true }]);
        const cleared = applyOpenAppClientBootstrapBlock(withBlock, []);
        expect(cleared).not.toContain('Open App client bootstrap');
        expect(cleared).not.toContain('@acme/a-ng');
        expect(cleared).toContain('export const CLASS_REGISTRATIONS = [];');
    });
});
