import { describe, it, expect } from 'vitest';
import { parseImports, stripComments, isAllowed } from '../check-ui-layers.mjs';

describe('stripComments', () => {
    it('blanks line comments while preserving line numbers', () => {
        const source = ['const a = 1;', '// this calls new RunView() on the global provider', 'const b = 2;'].join('\n');
        const stripped = stripComments(source);
        expect(stripped.split('\n')).toHaveLength(3);
        expect(stripped).not.toContain('RunView');
        expect(stripped).toContain('const b = 2;');
    });

    it('blanks block comments while preserving line numbers', () => {
        const source = ['/**', ' * Loads via new Metadata() today.', ' */', 'export class X {}'].join('\n');
        const stripped = stripComments(source);
        expect(stripped.split('\n')).toHaveLength(4);
        expect(stripped).not.toContain('Metadata');
        expect(stripped.split('\n')[3]).toBe('export class X {}');
    });

    it('leaves real code alone', () => {
        const source = 'const rv = new RunView();';
        expect(stripComments(source)).toBe(source);
    });
});

describe('parseImports', () => {
    it('captures named bindings and the specifier', () => {
        const [result] = parseImports(`import { Router, ActivatedRoute } from '@angular/router';`);
        expect(result.Specifier).toBe('@angular/router');
        expect(result.Names).toEqual(['Router', 'ActivatedRoute']);
    });

    it('unwraps type-only and aliased bindings to the source name', () => {
        const [result] = parseImports(`import { type NavigationService as Nav } from '@memberjunction/ng-shared';`);
        expect(result.Names).toEqual(['NavigationService']);
    });

    it('handles multi-line import clauses', () => {
        const source = `import {\n    BaseResourceComponent,\n    SharedService,\n} from '@memberjunction/ng-shared';`;
        const [result] = parseImports(source);
        expect(result.Names).toEqual(['BaseResourceComponent', 'SharedService']);
    });

    it('captures bare side-effect imports', () => {
        const [result] = parseImports(`import '@mj-biz-apps/orders-entities';`);
        expect(result.Specifier).toBe('@mj-biz-apps/orders-entities');
        expect(result.Names).toEqual([]);
    });

    it('captures re-exports, which bind symbols just as imports do', () => {
        const [result] = parseImports(`export { Router } from '@angular/router';`);
        expect(result.Specifier).toBe('@angular/router');
        expect(result.Names).toEqual(['Router']);
    });

    it('reports the 1-based line of each specifier', () => {
        const source = [`import { A } from 'a';`, ``, `import { B } from 'b';`].join('\n');
        const results = parseImports(source);
        expect(results.map((r) => r.Line)).toEqual([1, 3]);
    });

    it('does not treat a namespace import as a named binding', () => {
        const [result] = parseImports(`import * as path from 'node:path';`);
        expect(result.Names).toEqual([]);
    });
});

describe('isAllowed (reviewed-exception marker)', () => {
    it('honours a marker on the offending line', () => {
        const lines = ['import { Router } from \'@angular/router\'; // mj-ui-layers-allow: reason'];
        expect(isAllowed(lines, 1)).toBe(true);
    });

    it('honours a marker on the line directly above', () => {
        const lines = ['// mj-ui-layers-allow: reason', 'import { Router } from \'@angular/router\';'];
        expect(isAllowed(lines, 2)).toBe(true);
    });

    it('does NOT reach further than one line above', () => {
        // A wider window would let a marker drift away from the thing it excuses.
        const lines = ['// mj-ui-layers-allow: reason', '', 'import { Router } from \'@angular/router\';'];
        expect(isAllowed(lines, 3)).toBe(false);
    });

    it('is false with no marker anywhere', () => {
        expect(isAllowed(['import { Router } from \'@angular/router\';'], 1)).toBe(false);
    });

    it('does not crash on the first line', () => {
        expect(isAllowed(['something'], 1)).toBe(false);
    });
});
