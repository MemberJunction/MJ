/**
 * Loads the C1 corpus fixture into the pstruth C1 tables, then declares the truth suite's immutable fields through
 * MJAPI. Run after `truth:provision`, with MJAPI running and the repo env file sourced; restart MJAPI afterwards so it
 * reads the changed field metadata.
 *
 *   tsx scripts/load-c1-corpus.ts
 */
import { ScriptRunner } from './script-runner';
import { TruthConnection } from '../src/db/connection';
import { C1CorpusFixture } from '../src/fixtures/c1-corpus-loader';
import { ImmutableFieldDeclarations } from '../src/fixtures/immutable-fields';

async function main(): Promise<void> {
  const pool = await TruthConnection.OpenPool();
  try {
    console.log(JSON.stringify(await C1CorpusFixture.LoadC1Corpus(pool)));
  } finally {
    await pool.close();
  }
  const provider = await ScriptRunner.ConnectWithApiKey();
  console.log(`immutable fields declared: ${await ImmutableFieldDeclarations.Apply(provider, provider.CurrentUser)}`);
}

void ScriptRunner.Run(main);
