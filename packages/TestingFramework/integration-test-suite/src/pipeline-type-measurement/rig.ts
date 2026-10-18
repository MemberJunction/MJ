/**
 * rig.ts — the rig's start-up, in the order that keeps a run safe: parse the arguments, name the target
 * database, refuse a repo output path and a database that does not look like a development one, and
 * only then connect and run.
 *
 * The rig script supplies the two steps that need a live system (reading the database settings, and
 * connecting); everything else, including the order, is here, where it is unit-tested with mocks.
 */
import { ParseMeasurementArgs } from './args';
import { AssertDatabaseAllowed, DescribeDatabaseTarget } from './db-guard';
import type { DatabaseTarget } from './db-guard';
import { AssertOutputOutsideRepo } from './repo-guard';
import { RunMeasurement } from './run';
import type { MeasurementBackend, MeasurementIO, MeasurementOutcome } from './run';
import type { MeasurementOptions } from './types';

/** A connection to the target database, and the live backend over it. */
export interface RigSession {
    Backend: MeasurementBackend;
    /** Closes the connection. */
    Close(): Promise<void>;
}

/** What the rig script supplies. `TTarget` is its full database settings, credentials included. */
export interface RigDependencies<TTarget extends DatabaseTarget> {
    /** Reads the database settings the run would connect with, without connecting. */
    LoadDatabaseTarget(): Promise<TTarget>;
    /** Connects to that database and builds the live backend. Called only once every guard has passed. */
    Connect(target: TTarget, options: MeasurementOptions): Promise<RigSession>;
    IO: MeasurementIO;
}

/**
 * Runs the rig: prints the target database (dry run included), refuses an output path inside a repo
 * and a database that does not look like a development or clean-room one (unless `--allow-db` names
 * it), and only then connects, runs the measurement and closes the connection.
 * @throws Error for bad arguments, a refused output path or database, or a failed measurement.
 */
export async function RunMeasurementRig<TTarget extends DatabaseTarget>(argv: readonly string[], deps: RigDependencies<TTarget>): Promise<MeasurementOutcome> {
    const options = ParseMeasurementArgs(argv);
    const target = await deps.LoadDatabaseTarget();
    deps.IO.Log(`Database: ${DescribeDatabaseTarget(target)}`);
    AssertOutputOutsideRepo(options.OutDir);
    AssertDatabaseAllowed(target, options.AllowDatabase);
    const session = await deps.Connect(target, options);
    try {
        return await RunMeasurement(options, session.Backend, deps.IO);
    } finally {
        await session.Close();
    }
}
