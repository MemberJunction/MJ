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

describe('ServerOperationScopeManager: a client\'s own request vs server work (AsyncLocalStorage)', () => {
    const scopes = (): ServerOperationScopeManager => ServerOperationScopeManager.Instance;
    const anyAuthority = (): boolean => scopes().IsOperationActive(['Some.Operation'], 'Some Entity') || scopes().IsOperationActive(undefined, 'Some Entity');

    beforeEach(() => {
        ServerOperationScopeManager.Instance.SetTracker(new NodeAsyncServerOperationScopeTracker());
    });

    afterEach(() => {
        ServerOperationScopeManager.Instance.SetTracker(new StackServerOperationScopeTracker());
    });

    it('reads only code directly inside a client CRUD boundary as the client\'s own request', async () => {
        expect(scopes().IsInDirectClientCrud()).toBe(false);
        await scopes().RunInClientCrudBoundary(async () => {
            await delayTick(1);
            expect(scopes().IsInDirectClientCrud()).toBe(true);
            await scopes().RunWithAuthority({ operationKey: 'Some.Operation', source: 'ServerEngine', allowedEntities: ['Some Entity'] }, async () => {
                expect(scopes().IsInDirectClientCrud()).toBe(false);
            });
            await scopes().RunWithoutAuthority(async () => {
                expect(scopes().IsInDirectClientCrud()).toBe(false);
            });
        });
    });

    it('takes work a client request starts and leaves running out of the request, granting it nothing', async () => {
        let leftRunning: Promise<void> = Promise.resolve();
        let plainSeesClient: boolean | undefined;
        let serverWorkSeesClient: boolean | undefined;
        let serverWorkHasAuthority: boolean | undefined;
        await scopes().RunInClientCrudBoundary(async () => {
            // As a save hook starting an agent run without waiting for it.
            void (async () => { await delayTick(10); plainSeesClient = scopes().IsInDirectClientCrud(); })();
            leftRunning = scopes().RunAsServerWork(async () => {
                await delayTick(10);
                serverWorkSeesClient = scopes().IsInDirectClientCrud();
                serverWorkHasAuthority = anyAuthority();
            });
        });
        await leftRunning;
        await delayTick(5);
        expect(plainSeesClient).toBe(true);
        expect(serverWorkSeesClient).toBe(false);
        expect(serverWorkHasAuthority).toBe(false);
    });

    it('leaves code outside a client request as it was, its server authority included', async () => {
        const frame = { operationKey: 'Some.Operation', source: 'ServerEngine' as const, allowedEntities: ['Some Entity'] };
        await scopes().RunWithAuthority(frame, () => scopes().RunAsServerWork(async () => {
            await delayTick(1);
            expect(anyAuthority()).toBe(true);
            expect(scopes().IsInDirectClientCrud()).toBe(false);
        }));
    });
});
