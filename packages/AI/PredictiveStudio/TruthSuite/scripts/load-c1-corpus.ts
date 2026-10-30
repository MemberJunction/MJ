/**
 * Loads the C1 corpus fixture into the pstruth C1 tables, then declares the truth suite's immutable fields through
 * MJAPI. Run after `truth:provision`, with MJAPI running and the repo env file sourced; restart MJAPI afterwards so it
 * reads the changed field metadata.
 *
 *   tsx scripts/load-c1-corpus.ts
 */
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { LoadClientConfig } from '@memberjunction/testing-integration';
import { TruthConnection } from '../src/db/connection';
import { C1CorpusFixture } from '../src/fixtures/c1-corpus-loader';
import { ImmutableFieldDeclarations } from '../src/fixtures/immutable-fields';

/** Connect with the system API key on a separate connection and return the provider. */
async function connect(): Promise<GraphQLDataProvider> {
  const client = LoadClientConfig();
  const provider = new GraphQLDataProvider();
  const config = new GraphQLProviderConfigData('', client.Url, '', async () => '', '__mj', undefined, undefined, client.MJAPIKey);
  if (!(await provider.Config(config, undefined, true))) throw new Error('GraphQLDataProvider Config() returned false');
  return provider;
}

async function main(): Promise<void> {
  const pool = await TruthConnection.OpenPool();
  try {
    console.log(JSON.stringify(await C1CorpusFixture.LoadC1Corpus(pool)));
  } finally {
    await pool.close();
  }
  const provider = await connect();
  console.log(`immutable fields declared: ${await ImmutableFieldDeclarations.Apply(provider, provider.CurrentUser)}`);
}

/** Runs `main` and exits 0, or prints the error with its stack and exits 1. */
async function run(): Promise<void> {
  try {
    await main();
    process.exit(0);
  } catch (error: unknown) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  }
}

void run();
