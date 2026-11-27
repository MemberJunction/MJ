/**
 * Declares the truth suite's immutable fields (`TRUTH_IMMUTABLE_FIELDS`: `MJ: Entity Fields.AllowUpdateAPI = false`) on
 * the provisioned pstruth entities, through the server provider. `truth:provision` runs it once the entities exist, so
 * every provisioned database carries the declarations the As-of Feature Assembly reads: a declared field is read as
 * stored, an undeclared updatable field of an untracked entity is refused (PR 5 D5-56). Restart MJAPI afterwards so it
 * reads the changed field metadata.
 *
 *   npx tsx scripts/declare-immutable-fields.ts
 */
import { BootstrapIntegrationServer } from '@memberjunction/testing-integration';
import { ImmutableFieldDeclarations } from '../src/fixtures/immutable-fields';
import { ScriptRunner } from './script-runner';

async function main(): Promise<void> {
  const server = await BootstrapIntegrationServer();
  try {
    console.log(`immutable fields declared: ${await ImmutableFieldDeclarations.Apply(server.Provider, server.User)}`);
  } finally {
    await server.ClosePool();
  }
}

void ScriptRunner.Run(main);
