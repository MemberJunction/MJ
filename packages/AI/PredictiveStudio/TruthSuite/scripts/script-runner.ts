/**
 * The shared plumbing of the truth suite's `tsx scripts/*.ts` probes: one MJAPI connection with the system API key,
 * and one way to run a script's `main` to an exit code.
 */
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { LoadClientConfig } from '@memberjunction/testing-integration';

/** Connects a script to MJAPI and runs it. */
export class ScriptRunner {
  /** Connect with the system API key on a separate connection and return the provider. */
  public static async ConnectWithApiKey(): Promise<GraphQLDataProvider> {
    const client = LoadClientConfig();
    const provider = new GraphQLDataProvider();
    const config = new GraphQLProviderConfigData('', client.Url, '', async () => '', '__mj', undefined, undefined, client.MJAPIKey);
    if (!(await provider.Config(config, undefined, true))) throw new Error('GraphQLDataProvider Config() returned false');
    return provider;
  }

  /** Runs `main` and exits 0, or prints the error with its stack (its message when it has none) and exits 1. */
  public static async Run(main: () => Promise<void>): Promise<void> {
    try {
      await main();
      process.exit(0);
    } catch (error: unknown) {
      console.error(error instanceof Error ? (error.stack || error.message) : String(error));
      process.exit(1);
    }
  }
}
