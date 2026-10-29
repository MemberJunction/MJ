/**
 * schema-mutating-tests.ts — runs the schema-mutating scenarios on a database it creates and drops.
 *
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/schema-mutating/schema-mutating-tests.ts [options]
 *
 * Creates `mj_rig_fls_<timestamp>_<hex>`, bootstraps it (migrate → sync push → CodeGen), runs the
 * field-level security reconciliation scenarios, and drops it — also when a scenario fails or the
 * process is interrupted. Needs the packages it shells out to built: `@memberjunction/cli` and
 * `@memberjunction/codegen-lib`.
 *
 * Options (local iteration; CI passes none):
 *   --keep-db           leave the database in place at the end, and print its name
 *   --bootstrap-only    create and bootstrap the database, keep it, run no scenarios
 *   --database <name>   use an existing, already bootstrapped database instead of creating one;
 *                       it is kept. The fixture schema must not exist in it yet.
 *
 * Server: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` (a login allowed to create databases),
 * optionally `CODEGEN_DB_USERNAME` / `CODEGEN_DB_PASSWORD` and `DB_TRUST_SERVER_CERTIFICATE`.
 *
 * Exit contract (harness standard): 0 all passed · 1 failures · 2 setup error.
 */
import { TestRunner } from '@memberjunction/testing-integration';
import { NewThrowawayDatabaseName, ReadServerConfig, ThrowawayDatabase } from './throwaway-database';
import { RegisterFlsReconciliationScenarios } from './fls-reconciliation-scenarios';

/** Parsed command-line options. */
export interface RigOptions {
    KeepDatabase: boolean;
    BootstrapOnly: boolean;
    ExistingDatabase?: string;
}

/** Parses the rig's arguments; throws on anything it does not know. */
export function ParseRigArgs(argv: string[]): RigOptions {
    const options: RigOptions = { KeepDatabase: false, BootstrapOnly: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--keep-db') {
            options.KeepDatabase = true;
        } else if (arg === '--bootstrap-only') {
            options.BootstrapOnly = true;
            options.KeepDatabase = true;
        } else if (arg === '--database') {
            const name = argv[++i];
            if (!name || name.startsWith('--')) {
                throw new Error('--database needs a database name');
            }
            options.ExistingDatabase = name;
            options.KeepDatabase = true;
        } else {
            throw new Error(`Unknown argument '${arg}'`);
        }
    }
    if (options.BootstrapOnly && options.ExistingDatabase) {
        throw new Error('--bootstrap-only and --database cannot be combined');
    }
    return options;
}

async function main(): Promise<number> {
    let options: RigOptions;
    let db: ThrowawayDatabase;
    try {
        options = ParseRigArgs(process.argv.slice(2));
        db = new ThrowawayDatabase(options.ExistingDatabase ?? NewThrowawayDatabaseName('fls'), ReadServerConfig(process.env));
    } catch (e) {
        console.error(`[rig] ${e instanceof Error ? e.message : String(e)}`);
        return 2;
    }

    let dropped = false;
    const cleanUp = async (): Promise<void> => {
        if (dropped) {
            return;
        }
        dropped = true;
        if (options.KeepDatabase) {
            await db.Close();
            console.log(`[rig] Kept database ${db.Name}`);
            return;
        }
        await db.Drop();
        console.log(`[rig] Dropped database ${db.Name}`);
    };
    const onSignal = (signal: NodeJS.Signals): void => {
        console.error(`[rig] ${signal} — cleaning up`);
        void cleanUp().finally(() => process.exit(2));
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    console.log(`[rig] Database ${db.Name}; CLI logs in ${db.LogDirectory}`);
    try {
        if (!options.ExistingDatabase) {
            try {
                await db.Create();
                await db.Bootstrap();
            } catch (e) {
                console.error(`[rig] Bootstrap failed: ${e instanceof Error ? e.message : String(e)}`);
                return 2;
            }
        }
        if (options.BootstrapOnly) {
            return 0;
        }
        const runner = new TestRunner('Schema-mutating rig — field-level security reconciliation');
        RegisterFlsReconciliationScenarios(runner, db);
        const failures = await runner.Run();
        return failures > 0 ? 1 : 0;
    } finally {
        try {
            await cleanUp();
        } catch (e) {
            console.error(`[rig] Could not drop ${db.Name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

const invokedDirectly = process.argv[1] !== undefined && /schema-mutating-tests\.[cm]?[tj]s$/.test(process.argv[1]);
if (invokedDirectly) {
    main().then(
        code => process.exit(code),
        e => {
            console.error(e);
            process.exit(2);
        }
    );
}
