/**
 * @fileoverview Server-side TaskGraph isolation runners and registry factory (`InProcess`, `Worker`, `Process`, `Container`).
 * @module @memberjunction/server
 */
import { InProcessIsolationRunner, type TaskGraphIsolationRunnerMap } from '@memberjunction/task-graph';
import { WorkerIsolationRunner } from './WorkerIsolationRunner.js';
import { ProcessIsolationRunner } from './ProcessIsolationRunner.js';
import { ContainerIsolationRunner, type ContainerIsolationRunnerOptions } from './ContainerIsolationRunner.js';

export * from './WorkerIsolationRunner.js';
export * from './ProcessIsolationRunner.js';
export * from './ContainerIsolationRunner.js';

export interface CreateIsolationRunnersOptions {
    readonly ContainerOptions?: ContainerIsolationRunnerOptions;
}

/**
 * Instantiates the full set of TaskGraph isolation runners (`InProcess`, `Worker`, `Process`, `Container`)
 * for wiring into {@link TaskGraphDispatcher}.
 */
export function CreateDefaultIsolationRunners(options: CreateIsolationRunnersOptions = {}): TaskGraphIsolationRunnerMap {
    return {
        InProcess: new InProcessIsolationRunner(),
        Worker: new WorkerIsolationRunner(),
        Process: new ProcessIsolationRunner(),
        Container: new ContainerIsolationRunner(options.ContainerOptions),
    };
}
