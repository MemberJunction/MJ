import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { extractBaseEntityRegistrations, parseManifestImports, stripComments } from '../check-manifest-registrations.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-manifest-registrations.mjs');

// ---------------------------------------------------------------------------
// extractBaseEntityRegistrations — keys on the exact shape CodeGen emits and on
// the shapes that must NOT count. If the decorator's emitted form changes, these
// fail loudly rather than the guard silently scanning zero classes and passing.
// ---------------------------------------------------------------------------

describe('extractBaseEntityRegistrations', () => {
   it('finds a registered entity subclass', () => {
      const src = [
         `@RegisterClass(BaseEntity, 'MJ: Conversations')`,
         `export class MJConversationEntityServer extends MJConversationEntity {`,
      ].join('\n');
      expect(extractBaseEntityRegistrations(src).map((r) => r.className)).toEqual(['MJConversationEntityServer']);
   });

   it('finds a registered entity subclass when the decorator line has a trailing comment', () => {
      const src = [
         `@RegisterClass(BaseEntity, 'MJ: Actions') // high priority — ensure this server subclass wins over the generated entity`,
         `export class MJActionEntityServer extends MJActionEntityExtended {`,
      ].join('\n');
      const hits = extractBaseEntityRegistrations(src);
      expect(hits).toHaveLength(1);
      expect(hits[0].className).toBe('MJActionEntityServer');
      expect(hits[0].allowed).toBe(false);
   });

   it('ignores registrations for other base classes', () => {
      const src = [
         `@RegisterClass(BaseAction, 'Send Email')`,
         `export class SendEmailAction extends BaseAction {`,
         `@RegisterClass(BaseLintRule, 'no-foo')`,
         `export class NoFooRule extends BaseLintRule {`,
      ].join('\n');
      expect(extractBaseEntityRegistrations(src)).toEqual([]);
   });

   it('ignores an example inside a block comment', () => {
      const src = [
         `/**`,
         ` * @RegisterClass(BaseEntity, 'MJ: Things')`,
         ` * export class MyExampleEntity extends BaseEntity {}`,
         ` */`,
         `export class RealHelper {}`,
      ].join('\n');
      expect(extractBaseEntityRegistrations(src)).toEqual([]);
   });

   it('ignores an example inside a line comment', () => {
      const src = `// @RegisterClass(BaseEntity, 'X') export class CommentedEntity extends BaseEntity {}`;
      expect(extractBaseEntityRegistrations(src)).toEqual([]);
   });

   // CodeGen's own emitters are the reason this rule exists: entity_subclasses_codegen.ts holds
   // the decorator and the class declaration inside a template literal.
   it("ignores CodeGen's template-literal emitter", () => {
      const src = [
         'const out = `',
         `@RegisterClass(BaseEntity, '\${entity.Name}')`,
         'export class ${sClassName} extends ${sBaseClass}<${sClassName}Type> {',
         '`;',
      ].join('\n');
      expect(extractBaseEntityRegistrations(src)).toEqual([]);
   });

   it('honours the allow marker above or on the decorator line', () => {
      const above = [
         `// manifest-registration-ok: abstract base, never instantiated directly`,
         `@RegisterClass(BaseEntity, 'MJ: Things')`,
         `export abstract class AbstractThingEntity extends BaseEntity {`,
      ].join('\n');
      const hitsAbove = extractBaseEntityRegistrations(above);
      expect(hitsAbove).toHaveLength(1);
      expect(hitsAbove[0].allowed).toBe(true);

      const inline = [
         `@RegisterClass(BaseEntity, 'MJ: Things') // manifest-registration-ok: inline fixture`,
         `export class InlineAllowedThingEntity extends BaseEntity {`,
      ].join('\n');
      const hitsInline = extractBaseEntityRegistrations(inline);
      expect(hitsInline).toHaveLength(1);
      expect(hitsInline[0].allowed).toBe(true);
   });
});

describe('parseManifestImports', () => {
   it('maps each imported identifier to its package and collects the packages', () => {
      const src = [
         `import { MJUserEntity, MJRoleEntity } from '@memberjunction/core-entities';`,
         `import { SomeServerEntity as Aliased } from '@memberjunction/core-entities-server';`,
      ].join('\n');
      const { identifiers, packages } = parseManifestImports(src);
      expect(identifiers.get('MJUserEntity')).toBe('@memberjunction/core-entities');
      expect(identifiers.get('MJRoleEntity')).toBe('@memberjunction/core-entities');
      expect(identifiers.get('SomeServerEntity')).toBe('@memberjunction/core-entities-server');
      expect([...packages].sort()).toEqual(['@memberjunction/core-entities', '@memberjunction/core-entities-server']);
   });
});

describe('stripComments', () => {
   it('preserves line numbering so reported lines stay accurate', () => {
      const src = ['const a = 1;', '/* two', '   lines */', 'const b = 2;'].join('\n');
      expect(stripComments(src).split('\n')).toHaveLength(4);
   });
});

// ---------------------------------------------------------------------------
// End to end against fixture trees. These pin the exit codes the CI step relies on.
// ---------------------------------------------------------------------------

/**
 * A minimal repo: one package exporting `cls` with a BaseEntity registration, and one manifest
 * that imports from that package — listing the class only when `listed` is true.
 */
function fixtureRepo({ cls = 'MJThingEntity', listed = true, extraSource = '' } = {}) {
   const root = mkdtempSync(join(tmpdir(), 'manifest-guard-'));
   writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'root',
      scripts: {
         'mj:manifest:server-bootstrap': 'node x --output ./packages/ServerBootstrap/src/generated/mj-class-registrations.ts',
      },
   }));
   const pkgDir = join(root, 'packages', 'CoreEntities', 'src');
   mkdirSync(pkgDir, { recursive: true });
   writeFileSync(join(root, 'packages', 'CoreEntities', 'package.json'), JSON.stringify({ name: '@acme/core-entities' }));
   writeFileSync(join(pkgDir, 'entities.ts'), [
      `@RegisterClass(BaseEntity, 'Acme: Things')`,
      `export class ${cls} extends BaseEntity {}`,
      extraSource,
   ].join('\n'));
   const manDir = join(root, 'packages', 'ServerBootstrap', 'src', 'generated');
   mkdirSync(manDir, { recursive: true });
   writeFileSync(join(root, 'packages', 'ServerBootstrap', 'package.json'), JSON.stringify({ name: '@acme/server-bootstrap' }));
   writeFileSync(join(manDir, 'mj-class-registrations.ts'), [
      `import { ${listed ? cls : 'MJSomethingElseEntity'} } from '@acme/core-entities';`,
      `export const CLASS_REGISTRATIONS_COUNT = 1;`,
   ].join('\n'));
   return root;
}

const run = (cwd) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });

describe('the gate end to end', () => {
   it('passes when the registered class is in the covering manifest', () => {
      const root = fixtureRepo({ listed: true });
      try {
         const r = run(root);
         expect(r.status).toBe(0);
         expect(r.stdout).toContain('all present');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });

   it('fails, names the class and prints the regeneration script when it is missing', () => {
      const root = fixtureRepo({ listed: false });
      try {
         const r = run(root);
         expect(r.status).toBe(1);
         expect(r.stderr).toContain('MJThingEntity');
         expect(r.stderr).toContain('packages/ServerBootstrap/src/generated/mj-class-registrations.ts');
         expect(r.stderr).toContain('pnpm run mj:manifest:server-bootstrap');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });

   it('passes when a missing class carries the allow marker', () => {
      const root = fixtureRepo({ listed: false });
      try {
         const file = join(root, 'packages', 'CoreEntities', 'src', 'entities.ts');
         writeFileSync(file, [
            `// manifest-registration-ok: fixture`,
            `@RegisterClass(BaseEntity, 'Acme: Things')`,
            `export class MJThingEntity extends BaseEntity {}`,
          ].join('\n'));
         const r = run(root);
         expect(r.status).toBe(0);
         expect(r.stdout).toContain('allow-marked');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });

   it('exits 2 rather than silently passing when no manifest exists', () => {
      const root = mkdtempSync(join(tmpdir(), 'manifest-guard-empty-'));
      try {
         mkdirSync(join(root, 'packages'), { recursive: true });
         const r = run(root);
         expect(r.status).toBe(2);
         expect(r.stderr).toContain('would check nothing');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });

   it('exits 2 when manifests exist on disk but none import any package', () => {
      const root = fixtureRepo({ listed: true });
      try {
         writeFileSync(
            join(root, 'packages', 'ServerBootstrap', 'src', 'generated', 'mj-class-registrations.ts'),
            `export * from './other.js';\n`
         );
         const r = run(root);
         expect(r.status).toBe(2);
         expect(r.stderr).toContain('would check nothing');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });

   it('exits 2 when no @RegisterClass(BaseEntity, …) classes are discovered', () => {
      const root = fixtureRepo({ listed: true });
      try {
         writeFileSync(join(root, 'packages', 'CoreEntities', 'src', 'entities.ts'), `export class PlainHelper {}\n`);
         const r = run(root);
         expect(r.status).toBe(2);
         expect(r.stderr).toContain('would check nothing');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });
});
