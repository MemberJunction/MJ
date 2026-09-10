import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EntityFieldExtendedTypes, EntityFieldExtendedType } from '@memberjunction/core';
import { FormLayoutResult, VirtualEntityDecorationResult } from '../../Misc/advanced_generation';

// Compile-time type assertions
type Expect<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

type _TFormLayout = Expect<Equal<NonNullable<FormLayoutResult['fieldCategories'][number]['extendedType']>, EntityFieldExtendedType>>;
type _TVirtualEntity = Expect<Equal<NonNullable<VirtualEntityDecorationResult['fieldDescriptions'][number]['extendedType']>, EntityFieldExtendedType>>;

describe('T6 — ExtendedType Enum Parity (C3, FM5)', () => {
   const repoRoot = path.resolve(__dirname, '../../../../../'); // scanner-placement-ok: reads metadata/prompts/templates/codegen, declared on @memberjunction/codegen-lib#test in turbo.json
   const formLayoutTemplatePath = path.join(repoRoot, 'metadata/prompts/templates/codegen/form-layout-generation.template.md');
   const veTemplatePath = path.join(repoRoot, 'metadata/prompts/templates/codegen/virtual-entity-field-decoration.template.md');

   it('form-layout-generation.template.md contains every member of EntityFieldExtendedTypes and no foreign values', () => {
      expect(fs.existsSync(formLayoutTemplatePath)).toBe(true);
      const content = fs.readFileSync(formLayoutTemplatePath, 'utf-8');

      // Find the "Valid values: ..." line
      const match = content.match(/Valid values:\s*([^\r\n]+)/);
      expect(match).not.toBeNull();
      const line = match![1];

      // Extract quoted tokens like 'Code', 'Email', etc.
      const tokens = Array.from(line.matchAll(/'([^']+)'/g)).map(m => m[1]);
      const tokenSet = new Set(tokens);

      // Verify every member of EntityFieldExtendedTypes is present
      for (const extType of EntityFieldExtendedTypes) {
         expect(tokenSet.has(extType), `Missing extendedType '${extType}' in form layout template`).toBe(true);
      }

      // Verify no extra unknown extended types
      const allowed = new Set<string>(EntityFieldExtendedTypes);
      for (const token of tokenSet) {
         expect(allowed.has(token), `Unexpected extendedType '${token}' in form layout template`).toBe(true);
      }
   });

   it('virtual-entity-field-decoration.template.md contains every member of EntityFieldExtendedTypes and no foreign values', () => {
      expect(fs.existsSync(veTemplatePath)).toBe(true);
      const content = fs.readFileSync(veTemplatePath, 'utf-8');

      // Find the "extendedType is optional — only use one of these exact values when the field content clearly matches: ..." line
      const match = content.match(/extendedType` is optional[^\r\n]*exact values[^\r\n]*:\s*([^\r\n.]+)/);
      expect(match).not.toBeNull();
      const line = match![1];

      // Extract backticked or comma-separated identifiers
      const tokens = Array.from(line.matchAll(/`?([A-Za-z0-9_]+)`?/g))
         .map(m => m[1])
         .filter(t => t.length > 0 && t !== 'or');
      const tokenSet = new Set(tokens);

      // Verify every member of EntityFieldExtendedTypes is present
      for (const extType of EntityFieldExtendedTypes) {
         expect(tokenSet.has(extType), `Missing extendedType '${extType}' in VE template`).toBe(true);
      }

      // Verify no extra unknown extended types
      const allowed = new Set<string>(EntityFieldExtendedTypes);
      for (const token of tokenSet) {
         expect(allowed.has(token), `Unexpected extendedType '${token}' in VE template`).toBe(true);
      }
   });
});
