/**
 * @file RecordCloneEngine.ts
 * Main engine facade for entity record cloning.
 * Exposes programmatic Clone, Plan, Describe, and GetLineage APIs.
 * @see plans/record-cloning/README.md §13.1
 */

import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import {
    ClonePlan,
    RecordCloneRequest,
    RecordCloneResult,
} from '@memberjunction/record-cloning-base';
import { ClonePlanner } from './ClonePlanner';
import { CloneExecutor } from './CloneExecutor';
import type { RecordCloneDescribeOutput, RecordCloneGetLineageOutput, RecordCloneKey } from '@memberjunction/core-entities';
import { RecordCloneOperationsHandler } from './operations';

export class RecordCloneEngine {
    private _provider?: IMetadataProvider;
    private _handler: RecordCloneOperationsHandler;
    private _planner: ClonePlanner;
    private _executor: CloneExecutor;

    public constructor(provider?: IMetadataProvider) {
        this._provider = provider;
        this._handler = new RecordCloneOperationsHandler(provider);
        this._planner = new ClonePlanner({ Provider: provider });
        this._executor = new CloneExecutor({ Provider: provider });
    }

    protected get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Executes an end-to-end clone operation (planning + execution).
     */
    public async Clone(request: RecordCloneRequest, user: UserInfo): Promise<RecordCloneResult> {
        const plan = await this._planner.Plan(request, user);
        return this._executor.Execute(plan, user);
    }

    /**
     * Computes a clone execution plan without executing changes.
     */
    public async Plan(request: RecordCloneRequest, user: UserInfo): Promise<ClonePlan> {
        return this._planner.Plan(request, user);
    }

    /**
     * Inspects clone capabilities and policies for an entity or record.
     */
    public async Describe(entityName: string, user: UserInfo, key?: RecordCloneKey): Promise<RecordCloneDescribeOutput> {
        return this._handler.Describe({ EntityName: entityName, Key: key }, user);
    }

    /**
     * Traverses record links to find clone ancestors and descendants.
     */
    public async GetLineage(
        entityName: string,
        key: RecordCloneKey,
        user: UserInfo,
        direction?: 'up' | 'down' | 'both'
    ): Promise<RecordCloneGetLineageOutput> {
        return this._handler.GetLineage({ EntityName: entityName, Key: key, Direction: direction }, user);
    }
}
