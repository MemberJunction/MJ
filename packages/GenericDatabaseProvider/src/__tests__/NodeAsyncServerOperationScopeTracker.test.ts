import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ServerOperationScopeManager,
    StackServerOperationScopeTracker,
} from '@memberjunction/core';
import { NodeAsyncServerOperationScopeTracker } from '../NodeAsyncServerOperationScopeTracker.js';

function delayTick(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('NodeAsyncServerOperationScopeTracker (AsyncLocalStorage isolation)', () => {
    beforeEach(() => {
        ServerOperationScopeManager.Instance.SetTracker(new NodeAsyncServerOperationScopeTracker());
    });

    afterEach(() => {
        ServerOperationScopeManager.Instance.SetTracker(new StackServerOperationScopeTracker());
    });

    it('isolates concurrent interleaved async authority frames across independent request chains', async () => {
        const observations: Record<string, { seesFinanceOp: boolean; seesElectionOp: boolean }> = {};

        const financeChain = ServerOperationScopeManager.Instance.RunWithAuthority(
            {
                operationKey: 'Accounting.PostJournalBatch',
                source: 'RemotableOperation',
                allowedEntities: ['Journal Entries'],
            },
            async () => {
                await delayTick(15);
                observations.finance = {
                    seesFinanceOp: ServerOperationScopeManager.Instance.IsOperationActive(
                        ['Accounting.PostJournalBatch'],
                        'Journal Entries',
                    ),
                    seesElectionOp: ServerOperationScopeManager.Instance.IsOperationActive(
                        ['Elections.CastBallot'],
                        'Election Ballots',
                    ),
                };
            },
        );

        const electionChain = ServerOperationScopeManager.Instance.RunWithAuthority(
            {
                operationKey: 'Elections.CastBallot',
                source: 'RemotableOperation',
                allowedEntities: ['Election Ballots'],
            },
            async () => {
                await delayTick(5);
                observations.election = {
                    seesFinanceOp: ServerOperationScopeManager.Instance.IsOperationActive(
                        ['Accounting.PostJournalBatch'],
                        'Journal Entries',
                    ),
                    seesElectionOp: ServerOperationScopeManager.Instance.IsOperationActive(
                        ['Elections.CastBallot'],
                        'Election Ballots',
                    ),
                };
            },
        );

        const unscopedClientChain = (async () => {
            await delayTick(10);
            observations.unscoped = {
                seesFinanceOp: ServerOperationScopeManager.Instance.IsOperationActive(['Accounting.PostJournalBatch']),
                seesElectionOp: ServerOperationScopeManager.Instance.IsOperationActive(['Elections.CastBallot']),
            };
        })();

        await Promise.all([financeChain, electionChain, unscopedClientChain]);

        expect(observations.finance).toEqual({ seesFinanceOp: true, seesElectionOp: false });
        expect(observations.election).toEqual({ seesFinanceOp: false, seesElectionOp: true });
        expect(observations.unscoped).toEqual({ seesFinanceOp: false, seesElectionOp: false });
    });

    it('masks outer authority inside RunInClientCrudBoundary while permitting inner nested domain RunWithAuthority', async () => {
        await ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: 'Outer.AmbientJob', source: 'ServerEngine' },
            async () => {
                expect(ServerOperationScopeManager.Instance.IsOperationActive(['Outer.AmbientJob'])).toBe(true);

                await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(async () => {
                    await delayTick(2);
                    expect(ServerOperationScopeManager.Instance.IsOperationActive(['Outer.AmbientJob'])).toBe(false);

                    await ServerOperationScopeManager.Instance.RunWithAuthority(
                        { operationKey: 'Inner.DomainOp', source: 'RemotableOperation' },
                        async () => {
                            await delayTick(2);
                            expect(ServerOperationScopeManager.Instance.IsOperationActive(['Inner.DomainOp'])).toBe(
                                true,
                            );
                            expect(ServerOperationScopeManager.Instance.IsOperationActive(['Outer.AmbientJob'])).toBe(
                                false,
                            );
                        },
                    );
                });

                expect(ServerOperationScopeManager.Instance.IsOperationActive(['Outer.AmbientJob'])).toBe(true);
            },
        );
    });
});
