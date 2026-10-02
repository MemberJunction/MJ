/**
 * Fresh-install emit contract — MemberJunction/MJ#4477, #4426.
 *
 * On a fresh distribution host every entity is a core (`__mj`) entity and the stock scaffold
 * excludes that schema, so CodeGen's non-core entity list is EMPTY. Several scaffold files
 * import a generated artifact unconditionally (`GeneratedEntities/src/index.ts` re-exports
 * `./generated/entity_subclasses.js`; `MJExplorer/src/app/app.module.ts` imports
 * `./generated/generated-forms.module`), so a generator that emits nothing for an empty input
 * set leaves the install unbuildable while CodeGen still reports success.
 *
 * That is exactly how #4477 escaped: since #3804 the generators were driven by iterating
 * `partitionEntitiesByOutputDirectory`, which returned an empty Map for an empty entity list,
 * so they were never called. `schema-output.test.ts` now pins the CALL (the partition always
 * seeds the default directory). This file pins the EMIT: handed an empty input set, each
 * generator must still write its artifact.
 *
 * Keep both halves. Either one alone lets a fresh install break silently.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';
import { AngularClientGeneratorBase } from '../Angular/angular-codegen';
import { GraphQLServerGeneratorBase } from '../Misc/graphql_server_codegen';
import { ActionSubClassGeneratorBase } from '../Misc/action_subclasses_codegen';
import { RemoteOperationGeneratorBase } from '../Misc/remote_operations_codegen';

const tempDirs: string[] = [];

/** A real directory per case: the contract under test is that the file lands on disk. */
function makeTempDir(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mj-empty-emit-${label}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

/** Asserts the artifact exists and is a non-trivial module, not a zero-byte file. */
function expectEmittedModule(dir: string, fileName: string): string {
  const filePath = path.join(dir, fileName);
  expect(fs.existsSync(filePath), `${fileName} was not emitted into ${dir}`).toBe(true);
  const content = fs.readFileSync(filePath, 'utf8');
  expect(content.trim().length, `${fileName} was emitted empty`).toBeGreaterThan(0);
  return content;
}

describe('fresh install: every generator emits its artifact for an empty input set', () => {
  it('EntitySubClasses emits the barrel GeneratedEntities re-exports', async () => {
    const dir = makeTempDir('entities');
    const generator = new EntitySubClassGeneratorBase();

    const ok = await generator.generateAllEntitySubClasses(
      // Never touched with zero entities: no entity means no per-entity DB round trip.
      {} as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[0],
      [],
      dir,
      true,
    );

    expect(ok).toBe(true);
    expectEmittedModule(dir, 'entity_subclasses.ts');
  });

  it('Angular emits the forms module app.module.ts imports', async () => {
    const dir = makeTempDir('angular');
    const generator = new AngularClientGeneratorBase();

    const ok = await generator.generateAngularCode(
      [],
      dir,
      '',
      // Only read while generating per-entity forms, of which there are none.
      {} as Parameters<AngularClientGeneratorBase['generateAngularCode']>[3],
      'Angular',
    );

    expect(ok).toBe(true);
    const content = expectEmittedModule(dir, 'generated-forms.module.ts');
    // The module must still declare the class app.module.ts imports by name.
    expect(content).toContain('export class GeneratedFormsModule');
  });

  it('GraphQLServer emits its resolver barrel', () => {
    const dir = makeTempDir('graphql');
    const generator = new GraphQLServerGeneratorBase();

    const ok = generator.generateGraphQLServerCode([], dir, 'mj_generatedentities', false);

    expect(ok).toBe(true);
    expectEmittedModule(dir, 'generated.ts');
  });

  it('ActionSubclasses emits the barrel GeneratedActions re-exports', async () => {
    const dir = makeTempDir('actions');
    const generator = new ActionSubClassGeneratorBase();

    const ok = await generator.generateActions([], dir);

    expect(ok).toBe(true);
    expectEmittedModule(dir, 'action_subclasses.ts');
  });

  it('RemoteOperations emits its barrel', async () => {
    const dir = makeTempDir('remote-ops');
    const generator = new RemoteOperationGeneratorBase();

    const ok = await generator.generateRemoteOperations([], dir);

    expect(ok).toBe(true);
    expectEmittedModule(dir, 'remote_operations.ts');
  });
});
