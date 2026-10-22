import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

describe('Generated GraphQL Schema Structural Rules', () => {
    it('requires every entity ObjectType declaring _mj__CreatedAt to also declare ReadableFields___', () => {
        const schemaPath = fileURLToPath(new URL('../generated/graphql-schemas/__mj.ts', import.meta.url));
        expect(existsSync(schemaPath), `Schema file must exist at ${schemaPath}`).toBe(true);

        const sourceCode = readFileSync(schemaPath, 'utf8');
        const sourceFile = ts.createSourceFile('__mj.ts', sourceCode, ts.ScriptTarget.Latest, true);

        const violations: string[] = [];
        let checkedEntitiesCount = 0;

        ts.forEachChild(sourceFile, (node) => {
            if (ts.isClassDeclaration(node) && node.name) {
                const className = node.name.text;
                const memberNames = new Set<string>();

                for (const member of node.members) {
                    if (member.name) {
                        if (ts.isIdentifier(member.name)) {
                            memberNames.add(member.name.text);
                        } else {
                            memberNames.add(member.name.getText(sourceFile));
                        }
                    }
                }

                if (memberNames.has('_mj__CreatedAt')) {
                    checkedEntitiesCount++;
                    if (!memberNames.has('ReadableFields___')) {
                        violations.push(className);
                    }
                }
            }
        });

        // Sanity guard: make sure we actually inspected entity classes in the file
        expect(checkedEntitiesCount).toBeGreaterThan(0);
        // Per-class rule: no entity ObjectType declaring _mj__CreatedAt may omit ReadableFields___
        expect(violations).toEqual([]);
    });
});
