import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PostgreSQLCodeGenProvider } from '../../Database/providers/postgresql/PostgreSQLCodeGenProvider';

describe('T16 — Proc Definition Contract and Drift Guard (C1, §0.3, D16)', () => {
   const repoRoot = path.resolve(__dirname, '../../../../../');
   const migrationsDir = path.join(repoRoot, 'migrations');

   it('finds newest migration defining spUpdateExistingEntityFieldsFromSchema and asserts guards', () => {
      // Find all migration files across migrations/v*
      const migrationFiles: string[] = [];
      function walkDir(dir: string): void {
         if (!fs.existsSync(dir)) return;
         const entries = fs.readdirSync(dir, { withFileTypes: true });
         for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
               walkDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.sql') && entry.name.startsWith('V')) {
               migrationFiles.push(fullPath);
            }
         }
      }
      walkDir(migrationsDir);

      // Filter to migrations that define spUpdateExistingEntityFieldsFromSchema
      const matching = migrationFiles.filter(filePath => {
         const content = fs.readFileSync(filePath, 'utf8');
         return (
            content.includes('spUpdateExistingEntityFieldsFromSchema') &&
            /CREATE\s+(OR\s+ALTER\s+)?PROC/i.test(content)
         );
      });

      expect(matching.length).toBeGreaterThan(0);

      // Sort by filename version prefix descending (e.g. V202609081500 > V202608260829)
      matching.sort((a, b) => {
         const nameA = path.basename(a);
         const nameB = path.basename(b);
         return nameB.localeCompare(nameA);
      });

      const newestMigrationPath = matching[0];
      const newestContent = fs.readFileSync(newestMigrationPath, 'utf8');

      // Assert guards in newest SQL Server migration body:
      // 1. IsSoftPrimaryKey guard (prevents wiping soft PKs)
      expect(newestContent).toContain('IsSoftPrimaryKey');
      // 2. IsSoftForeignKey guard (prevents wiping soft FKs)
      expect(newestContent).toContain('IsSoftForeignKey');
      // 3. AutoUpdateRelatedEntityInfo inside WHERE clause
      expect(newestContent).toContain('AutoUpdateRelatedEntityInfo');
      // Verify soft-FK predicate logic
      expect(newestContent).toMatch(/ef\.AutoUpdateRelatedEntityInfo\s*=\s*1\s+AND\s+ef\.IsSoftForeignKey\s*=\s*0/i);
      // 4. @IncludedSchemaNames parameter and table
      expect(newestContent).toContain('@IncludedSchemaNames');
      // 5. #uef_cols materialization
      expect(newestContent).toContain('#uef_cols');
   });

   it('asserts PostgreSQLCodeGenProvider metadataSupportObjects contains twin guards', () => {
      const provider = new PostgreSQLCodeGenProvider();
      const sql = provider.getMetadataSupportObjectsSQL('__mj');
      expect(sql).toBeTruthy();
      expect(sql!).toContain('spUpdateExistingEntityFieldsFromSchema');

      // 1. IsSoftPrimaryKey guard
      expect(sql!).toContain('IsSoftPrimaryKey');
      expect(sql!).toMatch(/NOT\s+ef\."IsSoftPrimaryKey"/i);

      // 2. IsSoftForeignKey guard & AutoUpdateRelatedEntityInfo
      expect(sql!).toContain('IsSoftForeignKey');
      expect(sql!).toContain('AutoUpdateRelatedEntityInfo');
      expect(sql!).toMatch(/ef\."AutoUpdateRelatedEntityInfo"\s+AND\s+NOT\s+ef\."IsSoftForeignKey"/i);

      // 3. Included schemas parameter
      expect(sql!).toContain('p_IncludedSchemaNames');
   });
});
