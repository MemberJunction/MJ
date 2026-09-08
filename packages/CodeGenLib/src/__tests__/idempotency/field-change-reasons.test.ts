import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
   FieldChangeReason,
   DISPLAYNAME_REOPEN_REASONS,
   TYPE_REOPEN_REASONS,
   ALL_FIELD_CHANGE_REASONS,
   parseChangeReasons,
} from '../../Database/manage-metadata';

describe('T16 — Field Change Reasons Classification and SQL Contract', () => {
   describe('parseChangeReasons', () => {
      it('parses empty, null, or undefined ChangeReasons into an empty array', () => {
         expect(parseChangeReasons('')).toEqual([]);
         expect(parseChangeReasons(null)).toEqual([]);
         expect(parseChangeReasons(undefined)).toEqual([]);
         expect(parseChangeReasons('   ')).toEqual([]);
      });

      it('parses valid comma-delimited reason strings', () => {
         expect(parseChangeReasons('Description,Type,Length')).toEqual([
            'Description',
            'Type',
            'Length',
         ]);
      });

      it('handles whitespace around tokens', () => {
         expect(parseChangeReasons('  Description ,  AllowsNull , Precision  ')).toEqual([
            'Description',
            'AllowsNull',
            'Precision',
         ]);
      });

      it('maps unknown tokens to Unknown', () => {
         expect(parseChangeReasons('Description,CustomToken,Type')).toEqual([
            'Description',
            'Unknown',
            'Type',
         ]);
      });
   });

   describe('classification constants', () => {
      it('DISPLAYNAME_REOPEN_REASONS contains only Description', () => {
         expect(Array.from(DISPLAYNAME_REOPEN_REASONS)).toEqual(['Description']);
      });

      it('TYPE_REOPEN_REASONS contains exactly Type, Length, Precision, Scale, AllowsNull', () => {
         const expected = new Set(['Type', 'Length', 'Precision', 'Scale', 'AllowsNull']);
         expect(new Set(TYPE_REOPEN_REASONS)).toEqual(expected);
      });

      it('DISPLAYNAME_REOPEN_REASONS and TYPE_REOPEN_REASONS are disjoint', () => {
         for (const r of DISPLAYNAME_REOPEN_REASONS) {
            expect(TYPE_REOPEN_REASONS.has(r)).toBe(false);
         }
      });
   });

   describe('SQL Contract: T-SQL migration and PostgreSQL twin parity', () => {
      const allKnownReasons: FieldChangeReason[] = [
         'Description', 'Type', 'Length', 'Precision', 'Scale', 'AllowsNull',
         'DefaultValue', 'AutoIncrement', 'IsVirtual', 'IsComputed', 'RelatedEntityID',
         'RelatedEntityFieldName', 'IsPrimaryKey', 'IsUnique', 'AllowUpdateAPI', 'Sequence'
      ];

      // Resolve paths to migration and PG support object relative to workspace root
      const repoRoot = path.resolve(__dirname, '../../../../../');
      const tsqlMigrationPath = path.join(
         repoRoot,
         'migrations/v6/V202609081500__v6.1.x__EntityField_Sync_ChangeReasons.sql'
      );
      const pgSupportPath = path.join(
         repoRoot,
         'packages/CodeGenLib/src/Database/providers/postgresql/metadataSupportObjects.ts'
      );

      it('T-SQL migration file exists and contains all 16 FieldChangeReason literals in CONCAT_WS', () => {
         expect(fs.existsSync(tsqlMigrationPath)).toBe(true);
         const content = fs.readFileSync(tsqlMigrationPath, 'utf8');

         // Extract CONCAT_WS block
         const concatWsMatch = /CONCAT_WS\s*\([^;]+?\)\s*AS\s*ChangeReasons/is.exec(content);
         expect(concatWsMatch).not.toBeNull();
         const concatBlock = concatWsMatch![0];

         for (const reason of allKnownReasons) {
            expect(concatBlock).toContain(`'${reason}'`);
         }
      });

      it('T-SQL migration excludes Sequence from IsMaterialChange predicate', () => {
         const content = fs.readFileSync(tsqlMigrationPath, 'utf8');
         const stripped = content.replace(/--.*$/gm, '');
         const marker = 'AS IsMaterialChange';
         const idx = stripped.indexOf(marker);
         expect(idx).toBeGreaterThan(0);
         const beforeIdx = stripped.lastIndexOf('CASE WHEN', idx);
         expect(beforeIdx).toBeGreaterThan(0);
         const materialPredicate = stripped.slice(beforeIdx, idx);

         // Sequence must NOT appear in the IsMaterialChange predicate
         expect(materialPredicate).not.toMatch(/Sequence/i);
      });

      it('PostgreSQL support object contains all 16 FieldChangeReason literals in concat_ws', () => {
         expect(fs.existsSync(pgSupportPath)).toBe(true);
         const content = fs.readFileSync(pgSupportPath, 'utf8');

         const concatWsMatch = /concat_ws\s*\([^;]+?\)\s*AS\s*change_reasons/is.exec(content);
         expect(concatWsMatch).not.toBeNull();
         const concatBlock = concatWsMatch![0];

         for (const reason of allKnownReasons) {
            expect(concatBlock).toContain(`'${reason}'`);
         }
      });

      it('PostgreSQL support object excludes Sequence from is_material_change predicate', () => {
         const content = fs.readFileSync(pgSupportPath, 'utf8');
         const stripped = content.replace(/--.*$/gm, '');
         const marker = 'AS is_material_change';
         const idx = stripped.indexOf(marker);
         expect(idx).toBeGreaterThan(0);
         const beforeIdx = stripped.lastIndexOf('(', idx);
         expect(beforeIdx).toBeGreaterThan(0);
         const materialPredicate = stripped.slice(beforeIdx, idx);

         // Sequence must NOT appear in is_material_change predicate
         expect(materialPredicate).not.toMatch(/Sequence/i);
      });
   });
});
