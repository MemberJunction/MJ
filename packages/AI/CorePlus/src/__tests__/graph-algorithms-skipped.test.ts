/**
 * The `Skipped` outcome and exclusive fan-outs (Track C1.1, plan §5.2/§5.3).
 *
 * These are pure graph facts, so they are decidable without a database, a dispatcher or a model —
 * which is the whole reason the semantics live in this layer. The differential suite that guards the
 * cutover is built on these functions, so a bug here would be invisible to it: it would compare a
 * wrong answer against itself and agree.
 */
import { describe, it, expect } from 'vitest';
import {
    CompareEdgePrecedence,
    ComputeEligibleTasks,
    ComputeParentRollup,
    ComputeSkipCascade,
    ComputeTasksToBlock,
    ConfirmSkipSeeds,
    IsGraphStalled,
    ResolveExclusiveGroups,
    type EvaluatedEdge,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TaskGraphNodeStatus,
} from '../task-graph/graph-algorithms';

const n = (id: string, status: TaskGraphNodeStatus = 'Pending'): TaskGraphNode => ({ id, status });
const e = (taskId: string, dependsOnTaskId: string, dependencyType?: TaskGraphEdge['dependencyType']): TaskGraphEdge =>
    ({ taskId, dependsOnTaskId, dependencyType });

const xedge = (over: Partial<EvaluatedEdge> & Pick<EvaluatedEdge, 'id' | 'taskId'>): EvaluatedEdge => ({
    dependsOnTaskId: 'origin',
    exclusiveGroup: 'g',
    originStatus: 'Complete',
    priority: 0,
    sequence: 0,
    conditionOutcome: 'satisfied',
    ...over,
});

describe('Skipped satisfies dependents', () => {
    it('lets a join run when one of its predecessors was skipped', () => {
        // The reconvergence case: a fork ran branch B, skipped C, and the join must still run.
        // If Skipped did not satisfy, every branching flow would hang at its first join.
        const nodes = [n('a', 'Complete'), n('b', 'Complete'), n('c', 'Skipped'), n('join')];
        const eligible = ComputeEligibleTasks(nodes, [e('join', 'b'), e('join', 'c')]);
        expect(eligible.map((x) => x.id)).toEqual(['join']);
    });

    it('does NOT make a skipped predecessor block its dependents', () => {
        // Skipped is deliberately absent from UNSATISFIABLE_STATUSES. If it were present, the loser
        // branch would cascade Blocked and poison the parent rollup — the exact outcome this status
        // was introduced to avoid.
        const nodes = [n('loser', 'Skipped'), n('after')];
        expect(ComputeTasksToBlock(nodes, [e('after', 'loser')])).toEqual([]);
    });
});

describe('ComputeSkipCascade', () => {
    it('skips the whole tail of a losing branch', () => {
        const nodes = [n('x'), n('y'), n('z')];
        const edges = [e('y', 'x'), e('z', 'y')];
        expect(ComputeSkipCascade(nodes, edges, ['x']).sort()).toEqual(['y', 'z']);
    });

    it('spares a join that the WINNING branch still reaches', () => {
        // The single most important case. `join` depends on both branches; only one was skipped, so
        // it must survive. A naive forward walk from the loser would take it out.
        const nodes = [n('lose'), n('win', 'Complete'), n('join')];
        const edges = [e('join', 'lose'), e('join', 'win')];
        expect(ComputeSkipCascade(nodes, edges, ['lose'])).toEqual([]);
    });

    it('reaches a fixpoint rather than stopping after one pass', () => {
        // `far` is only decidable AFTER `near` is known to be skipped. A single forward pass in edge
        // order can visit far too early and let a doomed branch run.
        const nodes = [n('near'), n('far')];
        const edges = [e('far', 'near'), e('near', 'seed')];
        expect(ComputeSkipCascade([...nodes, n('seed')], edges, ['seed']).sort()).toEqual(['far', 'near']);
    });

    it('never skips an entry point', () => {
        expect(ComputeSkipCascade([n('entry')], [], [])).toEqual([]);
    });

    it('ignores Optional edges — an edge that does not gate cannot doom', () => {
        const nodes = [n('t')];
        expect(ComputeSkipCascade([...nodes, n('o', 'Skipped')], [e('t', 'o', 'Optional')], [])).toEqual([]);
    });

    it('leaves work that already started alone', () => {
        const nodes = [n('running', 'In Progress')];
        expect(ComputeSkipCascade([...nodes, n('s', 'Skipped')], [e('running', 's')], [])).toEqual([]);
    });
});

describe('ResolveExclusiveGroups', () => {
    it('keeps the highest-priority satisfied edge and loses the rest', () => {
        const res = ResolveExclusiveGroups([
            xedge({ id: 'lo', taskId: 'B', priority: 1 }),
            xedge({ id: 'hi', taskId: 'C', priority: 5 }),
        ]);
        expect(res.keptEdgeIDs).toEqual(['hi']);
        expect(res.loserEdgeIDs).toEqual(['lo']);
        expect(res.skipSeedTaskIDs).toEqual(['B']);
    });

    it('breaks a priority tie by ascending sequence', () => {
        // Compiled edges get fresh UUIDs, and Priority defaults to 0 — so without sequence the tie
        // would resolve differently than the engine being replaced. This pins the oracle's tiebreak.
        const res = ResolveExclusiveGroups([
            xedge({ id: 'second', taskId: 'B', sequence: 1 }),
            xedge({ id: 'first', taskId: 'C', sequence: 0 }),
        ]);
        expect(res.keptEdgeIDs).toEqual(['first']);
    });

    it('loses EVERY edge when none is satisfied — the walk just ends here', () => {
        const res = ResolveExclusiveGroups([
            xedge({ id: 'a', taskId: 'B', conditionOutcome: 'unsatisfied' }),
            xedge({ id: 'b', taskId: 'C', conditionOutcome: 'unsatisfied' }),
        ]);
        expect(res.keptEdgeIDs).toEqual([]);
        expect(res.skipSeedTaskIDs.sort()).toEqual(['B', 'C']);
        expect(res.holdTaskIDs).toEqual([]);
    });

    it('HOLDS the entire group when any condition is unevaluable', () => {
        // The rule that makes "a broken condition stalls visibly" true. Without it the kept edges of
        // a Complete origin are satisfied prerequisites and EVERY branch fires at once — a typo
        // silently multiplying a fork.
        const res = ResolveExclusiveGroups([
            xedge({ id: 'ok', taskId: 'B', conditionOutcome: 'satisfied' }),
            xedge({ id: 'broken', taskId: 'C', conditionOutcome: 'unevaluable' }),
        ]);
        expect(res.keptEdgeIDs).toEqual([]);
        expect(res.loserEdgeIDs).toEqual([]);
        expect(res.skipSeedTaskIDs).toEqual([]);
        expect(res.holdTaskIDs.sort()).toEqual(['B', 'C']);
    });

    it('does not decide a group whose origin has not finished', () => {
        const res = ResolveExclusiveGroups([xedge({ id: 'a', taskId: 'B', originStatus: 'In Progress' })]);
        expect(res).toEqual({ keptEdgeIDs: [], loserEdgeIDs: [], skipSeedTaskIDs: [], holdTaskIDs: [] });
    });

    it('decides on a Failed origin ONLY under edge failure semantics', () => {
        const edges = [xedge({ id: 'recover', taskId: 'B', originStatus: 'Failed' })];
        expect(ResolveExclusiveGroups(edges).keptEdgeIDs).toEqual([]);
        expect(
            ResolveExclusiveGroups(edges, new Set<TaskGraphNodeStatus>(['Complete', 'Failed'])).keptEdgeIDs,
        ).toEqual(['recover']);
    });

    it('resolves each group independently', () => {
        const res = ResolveExclusiveGroups([
            xedge({ id: 'g1a', taskId: 'B', exclusiveGroup: 'one', priority: 1 }),
            xedge({ id: 'g1b', taskId: 'C', exclusiveGroup: 'one', priority: 0 }),
            xedge({ id: 'g2a', taskId: 'D', exclusiveGroup: 'two', priority: 0 }),
        ]);
        expect(res.keptEdgeIDs.sort()).toEqual(['g1a', 'g2a']);
    });
});

describe('ComputeParentRollup with Skipped', () => {
    it('settles Complete when the only non-complete children were skipped', () => {
        // Without this a sequential flow containing ONE fork would settle Blocked every time.
        const roll = ComputeParentRollup([n('a', 'Complete'), n('b', 'Skipped')]);
        expect(roll.status).toBe('Complete');
        expect(roll.outcome).toBe('settled');
    });

    it('counts a skipped child as done, so a branching flow can reach 100%', () => {
        expect(ComputeParentRollup([n('a', 'Complete'), n('b', 'Skipped')]).percentComplete).toBe(100);
    });

    it('still fails on a genuine failure alongside a skip', () => {
        expect(ComputeParentRollup([n('a', 'Failed'), n('b', 'Skipped')]).status).toBe('Failed');
    });

    it('settles Complete when a failure was HANDLED by a recovery path', () => {
        // failureSemantics: 'edges'. A flow that failed a step, recovered, and reached the end is a
        // success — which is what the flow engine reports today.
        const roll = ComputeParentRollup([n('a', 'Failed'), n('b', 'Complete')], new Set(['a']));
        expect(roll.status).toBe('Complete');
    });

    it('still fails when the failure was NOT handled', () => {
        expect(ComputeParentRollup([n('a', 'Failed'), n('b', 'Complete')]).status).toBe('Failed');
    });
});

describe('handled failures do not block dependents', () => {
    it('blocks dependents of an unhandled failure', () => {
        expect(ComputeTasksToBlock([n('f', 'Failed'), n('d')], [e('d', 'f')])).toEqual(['d']);
    });

    it('leaves dependents alone when the failure had a recovery path', () => {
        expect(ComputeTasksToBlock([n('f', 'Failed'), n('d')], [e('d', 'f')], new Set(['f']))).toEqual([]);
    });
});

describe('a handled failure releases its recovery path', () => {
    it('makes the recovery target eligible when the failure is handled', () => {
        // Under failureSemantics 'edges', a Failed origin with a satisfied outgoing edge is a
        // HANDLED failure: the author drew a way out and it is live. Its target was previously
        // neither Blocked (handled failures are excluded from blocking) nor Skipped nor eligible —
        // so the graph sat In Progress forever. Before the recovery machinery existed it at least
        // settled Failed; turning a wrong answer into NO answer is worse.
        const nodes = [n('risky', 'Failed'), n('recover')];
        const edges = [e('recover', 'risky')];

        expect(ComputeEligibleTasks(nodes, edges)).toHaveLength(0);
        expect(ComputeEligibleTasks(nodes, edges, new Set(['risky'])).map((x) => x.id)).toEqual(['recover']);
    });

    it('leaves an UNhandled failure blocking, which is the whole point of the distinction', () => {
        // Nobody drew a recovery route here, so the failure is terminal for its dependents. If this
        // released too, a graph would sail past every failure it never anticipated.
        const nodes = [n('risky', 'Failed'), n('after')];
        const edges = [e('after', 'risky')];

        expect(ComputeEligibleTasks(nodes, edges, new Set(['someone-else']))).toHaveLength(0);
    });

    it('still requires the OTHER prerequisites to be satisfied', () => {
        // A handled failure satisfies its own edge, not the node's other edges.
        const nodes = [n('risky', 'Failed'), n('slow', 'Pending'), n('recover')];
        const edges = [e('recover', 'risky'), e('recover', 'slow')];

        // `slow` is itself eligible — it has no prerequisites. The assertion is about `recover`.
        const eligible = ComputeEligibleTasks(nodes, edges, new Set(['risky'])).map((x) => x.id);
        expect(eligible).not.toContain('recover');
    });
});

/**
 * P1 — a task may be marked Skipped only when EVERY route into it has been cut.
 *
 * The dispatcher already states that invariant for ordinary dropped edges (`stillReachable`), and
 * `ComputeSkipCascade`'s own doc promises it for joins: "a join that is also reachable from the
 * winning branch therefore survives". Exclusive losers bypassed both — every loser's target was
 * seeded and written `Skipped` unconditionally.
 *
 * Both failure shapes settle the graph **Complete with the work never executed**. No error, no
 * stall: the strongest reason this is HIGH.
 */
describe('P1: an exclusive loser cannot skip a task another route still reaches', () => {
    it('does not seed a target the WINNER also points at', () => {
        // Two conditions routing to one destination. `AIAgentStepPath` has no Origin+Destination
        // unique constraint, so this is drawable — and one edge wins while the other loses, making
        // the target simultaneously the winner's target and a skip seed. It was skipped 100% of the
        // time; the legacy walker ran it.
        const res = ResolveExclusiveGroups([
            xedge({ id: 'e1', taskId: 'B', priority: 5 }),
            xedge({ id: 'e2', taskId: 'B', priority: 1 }),
        ]);
        expect(res.keptEdgeIDs).toEqual(['e1']);
        expect(res.loserEdgeIDs).toEqual(['e2']);
        expect(res.skipSeedTaskIDs).toEqual([]);
    });

    it('still seeds a loser whose target the winner does NOT reach', () => {
        // The ordinary case must keep working — this is the guard against over-correcting.
        const res = ResolveExclusiveGroups([
            xedge({ id: 'win', taskId: 'B', priority: 5 }),
            xedge({ id: 'lose', taskId: 'C', priority: 1 }),
        ]);
        expect(res.skipSeedTaskIDs).toEqual(['C']);
    });

    it('confirms a seed only when no live gating edge still reaches it', () => {
        // The skip-a-step diamond: A →(cond)→ Review → Publish, A →(else)→ Publish.
        // The loser edge A→Publish seeds Publish while Review is still running. Publish must
        // survive: Review→Publish is live, so a route into it remains.
        const live: TaskGraphEdge[] = [e('Review', 'A'), e('Publish', 'Review')];
        expect(ConfirmSkipSeeds(['Publish'], live)).toEqual([]);
    });

    it('confirms a seed with every route cut', () => {
        // A →(c)→ B, A →(!c)→ C with c true: C's only route was the losing edge, which is not in
        // `liveEdges`. Nothing reaches C, so the skip is real.
        expect(ConfirmSkipSeeds(['C'], [e('B', 'A')])).toEqual(['C']);
    });

    it('ignores non-gating edges when deciding whether a route survives', () => {
        // Optional/Corequisite edges do not gate a task starting, so they cannot keep it alive —
        // the same rule ComputeEligibleTasks and ComputeSkipCascade already follow.
        const live: TaskGraphEdge[] = [e('C', 'A', 'Optional')];
        expect(ConfirmSkipSeeds(['C'], live)).toEqual(['C']);
    });
});

/**
 * The three properties the reviewing agent asked confirmation to hold (PR #3745).
 *
 * Seed confirmation decides only whether a seed becomes `Skipped` *now*. It must never take work
 * away from the two mechanisms that own the other outcomes: the blocking machinery (failure) and the
 * cascade (descendants).
 */
describe('P1: what seed confirmation must NOT decide', () => {
    it('declines to confirm when a route survives — delay, never wrong execution', () => {
        // Property 1: an unconfirmed seed is simply not-skipped-yet. It stays claim-filtered for the
        // pass and a later pass decides. The worst case is a cycle of delay; the alternative is
        // executing or skipping the wrong thing irreversibly.
        expect(ConfirmSkipSeeds(['J'], [e('J', 'Live')])).toEqual([]);
    });

    it('does NOT confirm a seed whose surviving route is failure-dead — Blocked owns that', () => {
        // Property 2: failure precedence. A route from a Failed origin cannot satisfy its dependent,
        // but the node must end up Blocked, not Skipped — the two mean different things to a reader
        // ("something broke" vs "the workflow went the other way").
        //
        // Confirmation stays out of it by construction: the edge from the failed origin is still a
        // live gating edge, so the seed is declined and ComputeTasksToBlock decides.
        const live: TaskGraphEdge[] = [e('J', 'Boom')];
        expect(ConfirmSkipSeeds(['J'], live)).toEqual([]);

        const nodes = [n('Boom', 'Failed'), n('J')];
        expect(ComputeTasksToBlock(nodes, live)).toContain('J');
    });

    it('leaves descendants to the cascade — a chain behind a confirmed seed still skips', () => {
        // Property 3: confirmation gates SEED GENERATION only. loser → B → C, C reachable only
        // through B: B is confirmed, and C follows via the cascade's status rule.
        const chain: TaskGraphEdge[] = [e('C', 'B')];
        expect(ConfirmSkipSeeds(['B'], chain)).toEqual(['B']);

        const nodes = [n('A', 'Complete'), n('B'), n('C')];
        expect(ComputeSkipCascade(nodes, chain, ['B'])).toEqual(['C']);
    });

    it('and a descendant with a second live route survives the cascade', () => {
        // The join case, one level down: C is reached by the skipped B AND by a live D.
        const edges: TaskGraphEdge[] = [e('C', 'B'), e('C', 'D')];
        const nodes = [n('B'), n('C'), n('D')];
        expect(ComputeSkipCascade(nodes, edges, ['B'])).toEqual([]);
    });
});

/**
 * P2 — a held graph must not report as healthy.
 *
 * A task held because its guard could not be evaluated has a live gating edge from a `Complete`
 * origin, so `ComputeEligibleTasks` says it is eligible while the dispatcher refuses to claim it.
 * "Something is eligible" then reads as "not stalled", and a graph that will wait forever produced
 * no diagnostics at all — which is the silence the hold mechanism exists to break.
 */
describe('R2-4: a failure decides a fork only where the dialect says failures decide', () => {
    // The dispatcher passed `['Complete','Failed']` unconditionally, with a comment claiming a
    // loop-agent graph saw Complete-only. It did not — the same set went to every graph. Under
    // `'block'`, the spec's DEFAULT, that was silently catastrophic: a Failed origin resolved its
    // group, the losers were removed and seeded, ComputeSkipCascade confirmed them Skipped, Skipped
    // satisfies dependents, and because the removed loser edges also sever ComputeTasksToBlock's
    // forward walk, a join fed by an independent healthy route EXECUTED downstream of an unhandled
    // failure. The parent still rolled up Failed — the verdict looked right, the side effects had
    // already fired.

    /** `E → F(fails)`, exclusive `(succeeded)→W` / `(failed)→R`. */
    const failedFork = (): Parameters<typeof ResolveExclusiveGroups>[0] => ([
        { id: 'e-w', taskId: 'W', dependsOnTaskId: 'F', exclusiveGroup: 'g',
          originStatus: 'Failed', priority: 0, sequence: 0, conditionOutcome: 'unsatisfied' },
        { id: 'e-r', taskId: 'R', dependsOnTaskId: 'F', exclusiveGroup: 'g',
          originStatus: 'Failed', priority: 0, sequence: 1, conditionOutcome: 'satisfied' },
    ]);

    it('under BLOCK, a Failed origin decides nothing — the group stays unresolved', () => {
        // Nothing kept, nothing lost, nothing seeded. Every edge stays live, so the ordinary block
        // cascade owns everything downstream, which is what 'block' means.
        const r = ResolveExclusiveGroups(failedFork(), new Set(['Complete']));
        expect(r.keptEdgeIDs).toEqual([]);
        expect(r.loserEdgeIDs).toEqual([]);
        expect(r.skipSeedTaskIDs).toEqual([]);
        expect(r.holdTaskIDs).toEqual([]);
    });

    it('under EDGES, a Failed origin still decides — the recovery path is the point', () => {
        // A flow's failure handling IS its outgoing edges. This dialect must keep working exactly as
        // it does today, or every drawn recovery route stops running.
        const r = ResolveExclusiveGroups(failedFork(), new Set(['Complete', 'Failed']));
        expect(r.keptEdgeIDs).toEqual(['e-r']);
        expect(r.loserEdgeIDs).toEqual(['e-w']);
        expect(r.skipSeedTaskIDs).toEqual(['W']);
    });

    it('a COMPLETE origin decides under either dialect', () => {
        // The change is about failures only. A successful fork must behave identically in both.
        const completed = failedFork().map((e) => ({ ...e, originStatus: 'Complete' as const }));
        for (const decides of [new Set(['Complete']), new Set(['Complete', 'Failed'])]) {
            const r = ResolveExclusiveGroups(completed, decides as ReadonlySet<TaskGraphNodeStatus>);
            expect(r.keptEdgeIDs).toEqual(['e-r']);
            expect(r.skipSeedTaskIDs).toEqual(['W']);
        }
    });

    it('defaults to Complete-only when the caller says nothing', () => {
        // The safe direction: a caller that has not decided must not resolve forks on the say-so of
        // a failure.
        expect(ResolveExclusiveGroups(failedFork()).loserEdgeIDs).toEqual([]);
    });
});

describe('R2-5: a tied group resolves the same way every time', () => {
    // Priority and sequence both default to 0, and `Submit` persists those defaults, so a
    // hand-authored or LLM-authored spec routinely produces a genuine tie. Dependencies load with no
    // ORDER BY, so the winner was decided by row order — which can differ between polls. Worst
    // interleaving: poll 1 picks X→B and skips C; poll 2's row order flips, picks Y→C (already
    // Skipped) and skips B. BOTH branches Skipped, graph settles Complete having executed neither.
    const tied = (): EvaluatedEdge[] => ([
        { id: 'edge-x', taskId: 'B', dependsOnTaskId: 'A', exclusiveGroup: 'g',
          originStatus: 'Complete', priority: 0, sequence: 0, conditionOutcome: 'satisfied' },
        { id: 'edge-y', taskId: 'C', dependsOnTaskId: 'A', exclusiveGroup: 'g',
          originStatus: 'Complete', priority: 0, sequence: 0, conditionOutcome: 'satisfied' },
    ]);

    it('picks the same winner whichever order the rows arrive in', () => {
        const forward = ResolveExclusiveGroups(tied());
        const reversed = ResolveExclusiveGroups([...tied()].reverse());
        expect(forward.keptEdgeIDs).toEqual(reversed.keptEdgeIDs);
        expect(forward.skipSeedTaskIDs).toEqual(reversed.skipSeedTaskIDs);
    });

    it('still honours priority and sequence first — the tiebreak is a LAST key', () => {
        // Edge id is arbitrary, so it must never outrank a stated intent. 'edge-a' sorts before
        // 'edge-z' alphabetically; priority has to win anyway.
        const stated: EvaluatedEdge[] = [
            { id: 'edge-z', taskId: 'B', dependsOnTaskId: 'A', exclusiveGroup: 'g',
              originStatus: 'Complete', priority: 10, sequence: 5, conditionOutcome: 'satisfied' },
            { id: 'edge-a', taskId: 'C', dependsOnTaskId: 'A', exclusiveGroup: 'g',
              originStatus: 'Complete', priority: 1, sequence: 0, conditionOutcome: 'satisfied' },
        ];
        expect(ResolveExclusiveGroups(stated).keptEdgeIDs).toEqual(['edge-z']);
    });
});

describe('R2-3 refinement: a dominated unevaluable edge must not stall a decided fork', () => {
    // Holding on ANY unevaluable member is too blunt. An edge that could never have won — lower
    // priority than a satisfied one — tells us nothing about the outcome, and holding the group on
    // its account stalls a fork whose winner is already known.
    const withUnevaluable = (priority: number): EvaluatedEdge[] => ([
        { id: 'e-good', taskId: 'W', dependsOnTaskId: 'A', exclusiveGroup: 'g',
          originStatus: 'Complete', priority: 5, sequence: 0, conditionOutcome: 'satisfied' },
        { id: 'e-broken', taskId: 'X', dependsOnTaskId: 'A', exclusiveGroup: 'g',
          originStatus: 'Complete', priority, sequence: 0, conditionOutcome: 'unevaluable' },
    ]);

    it('resolves when the unevaluable edge could never have won', () => {
        const r = ResolveExclusiveGroups(withUnevaluable(1));
        expect(r.holdTaskIDs).toEqual([]);
        expect(r.keptEdgeIDs).toEqual(['e-good']);
        // The dominated edge loses like any other loser: it could not have been taken either way.
        expect(r.skipSeedTaskIDs).toEqual(['X']);
    });

    it('HOLDS when the unevaluable edge could have beaten the winner', () => {
        // Now the answer genuinely depends on the broken guard, so guessing is not available.
        expect(ResolveExclusiveGroups(withUnevaluable(10)).holdTaskIDs).toEqual(['W', 'X']);
    });

    it('holds when it ties on priority but would win on sequence', () => {
        const contender = withUnevaluable(5);
        contender[1].sequence = -1;
        expect(ResolveExclusiveGroups(contender).holdTaskIDs).toEqual(['W', 'X']);
    });

    it('HOLDS when nothing is satisfied at all — any unevaluable edge could have been the winner', () => {
        const none: EvaluatedEdge[] = [
            { id: 'e1', taskId: 'W', dependsOnTaskId: 'A', exclusiveGroup: 'g',
              originStatus: 'Complete', priority: 0, sequence: 0, conditionOutcome: 'unsatisfied' },
            { id: 'e2', taskId: 'X', dependsOnTaskId: 'A', exclusiveGroup: 'g',
              originStatus: 'Complete', priority: 0, sequence: 1, conditionOutcome: 'unevaluable' },
        ];
        expect(ResolveExclusiveGroups(none).holdTaskIDs).toEqual(['W', 'X']);
    });
});

describe('R2-8: a fork on a step that was itself skipped takes no branch', () => {
    // `Skipped` is not in `terminalDecides`, so the group never resolved and every edge stayed live
    // — and `Skipped` satisfies prerequisites, so whichever target had its OTHER prerequisites
    // healthy simply ran, chosen by graph accident with its guard never consulted. Ordinary
    // conditional edges out of the same origin ARE decided; the exclusive dialect bypassed the guard.
    const forkOnSkipped = (): EvaluatedEdge[] => ([
        { id: 'e-w', taskId: 'W', dependsOnTaskId: 'S', exclusiveGroup: 'g',
          originStatus: 'Skipped', priority: 0, sequence: 0, conditionOutcome: 'satisfied' },
        { id: 'e-l', taskId: 'L', dependsOnTaskId: 'S', exclusiveGroup: 'g',
          originStatus: 'Skipped', priority: 0, sequence: 1, conditionOutcome: 'unsatisfied' },
    ]);

    it('loses every branch rather than leaving them all live', () => {
        const r = ResolveExclusiveGroups(forkOnSkipped());
        expect(r.keptEdgeIDs).toEqual([]);
        expect(r.loserEdgeIDs).toEqual(['e-w', 'e-l']);
        expect(r.skipSeedTaskIDs).toEqual(['W', 'L']);
    });

    it('does so regardless of what the conditions would have said', () => {
        // Including an unevaluable one: a step that did not run cannot have a guard worth reading,
        // so this must not become a hold either.
        const broken = forkOnSkipped();
        broken[0].conditionOutcome = 'unevaluable';
        const r = ResolveExclusiveGroups(broken);
        expect(r.holdTaskIDs).toEqual([]);
        expect(r.skipSeedTaskIDs).toEqual(['W', 'L']);
    });

    it('agrees with the ordinary-edge dialect, which drops a Skipped origin\'s edges', () => {
        // Two dialects for one question is how this stayed hidden. `DecideGate` returns 'drop' for a
        // Skipped origin; this is the same answer in the exclusive vocabulary.
        expect(ResolveExclusiveGroups(forkOnSkipped()).keptEdgeIDs).toEqual([]);
    });
});

describe('R2-4 composed: under block, nothing downstream of an unhandled failure runs', () => {
    // The unit assertions above prove the resolution refuses to decide. This proves the CONSEQUENCE,
    // which is where the damage was: the losing edges were removed, and removing them also severed
    // ComputeTasksToBlock's forward walk — so a join fed by an independent healthy route became
    // eligible and EXECUTED downstream of an unhandled failure, while the parent still rolled up
    // Failed. The verdict looked right; the side effects had already fired.
    //
    //   F(Failed) ─exclusive─┬─(succeeded)→ W ─┐
    //                        └─(failed)   → R  │
    //                        H(Complete) ──────┴→ D
    const shape = () => {
        const nodes: TaskGraphNode[] = [
            { id: 'F', status: 'Failed' },
            { id: 'H', status: 'Complete' },
            { id: 'W', status: 'Pending' },
            { id: 'R', status: 'Pending' },
            { id: 'D', status: 'Pending' },
        ];
        const exclusive: EvaluatedEdge[] = [
            { id: 'e-w', taskId: 'W', dependsOnTaskId: 'F', exclusiveGroup: 'g',
              originStatus: 'Failed', priority: 0, sequence: 0, conditionOutcome: 'unsatisfied' },
            { id: 'e-r', taskId: 'R', dependsOnTaskId: 'F', exclusiveGroup: 'g',
              originStatus: 'Failed', priority: 0, sequence: 1, conditionOutcome: 'satisfied' },
        ];
        const allEdges: TaskGraphEdge[] = [
            { taskId: 'W', dependsOnTaskId: 'F' },
            { taskId: 'R', dependsOnTaskId: 'F' },
            { taskId: 'D', dependsOnTaskId: 'W' },
            { taskId: 'D', dependsOnTaskId: 'H' },
        ];
        return { nodes, exclusive, allEdges };
    };

    /** Runs the dispatcher's pure sequence for one pass under a given dialect. */
    const pass = (decides: ReadonlySet<TaskGraphNodeStatus>, handled: ReadonlySet<string>) => {
        const { nodes, exclusive, allEdges } = shape();
        const resolution = ResolveExclusiveGroups(exclusive, decides);
        const losers = new Set(resolution.loserEdgeIDs);
        // Losing edges are removed, exactly as the dispatcher removes them.
        const live = allEdges.filter((e) =>
            !(losers.has('e-w') && e.taskId === 'W' && e.dependsOnTaskId === 'F') &&
            !(losers.has('e-r') && e.taskId === 'R' && e.dependsOnTaskId === 'F'));
        const seeds = ConfirmSkipSeeds(resolution.skipSeedTaskIDs, live);
        for (const id of seeds) { const n = nodes.find((x) => x.id === id); if (n) n.status = 'Skipped'; }
        for (const id of ComputeSkipCascade(nodes, live, seeds)) {
            const n = nodes.find((x) => x.id === id); if (n) n.status = 'Skipped';
        }
        return {
            blocked: ComputeTasksToBlock(nodes, live, handled),
            eligible: ComputeEligibleTasks(nodes, live, handled).map((n) => n.id),
        };
    };

    it('BLOCKS the join instead of running it', () => {
        const { blocked, eligible } = pass(new Set(['Complete']), new Set());
        expect(eligible).not.toContain('D');
        expect(blocked).toContain('D');
    });

    it('blocks both branch targets too — the fork was never decided', () => {
        const { blocked, eligible } = pass(new Set(['Complete']), new Set());
        expect(blocked).toEqual(expect.arrayContaining(['W', 'R']));
        expect(eligible).toEqual([]);
    });

    it('and the OLD constant still reproduces the bug, so this fixture has teeth', () => {
        // `['Complete','Failed']` is exactly what the dispatcher passed for every graph. Run the
        // same shape through it and D becomes eligible: the fork resolved on a failure, W was
        // seeded and cascaded to Skipped, Skipped satisfied D's prerequisite, and the severed loser
        // edge took D out of the block walk's reach. A fixture that cannot show that is not
        // guarding anything.
        const { blocked, eligible } = pass(new Set(['Complete', 'Failed']), new Set());
        expect(eligible).toContain('D');
        expect(blocked).not.toContain('D');
    });

    it('under EDGES with the failure handled, the recovery branch still runs', () => {
        // The other dialect must keep working: a drawn recovery path is the whole point of 'edges',
        // and this fix must not cost it anything.
        const { eligible } = pass(new Set(['Complete', 'Failed']), new Set(['F']));
        expect(eligible).toContain('R');
        expect(eligible).not.toContain('W');
    });
});

describe('P2: IsGraphStalled sees holds', () => {
    const nodes = [n('A', 'Complete'), n('Guarded')];
    const edges = [e('Guarded', 'A')];

    it('reports a graph stalled when its only eligible task is held', () => {
        expect(IsGraphStalled(nodes, edges, new Set(['Guarded']))).toBe(true);
    });

    it('reports the same graph healthy when nothing is held', () => {
        expect(IsGraphStalled(nodes, edges)).toBe(false);
    });

    it('is not fooled into stalling while other work is genuinely eligible', () => {
        const wider = [...nodes, n('Other')];
        expect(IsGraphStalled(wider, edges, new Set(['Guarded']))).toBe(false);
    });
});

describe('R3-7: the tiebreak is ordinal, not locale-collated', () => {
    // `localeCompare` with no arguments sorts under the host's ICU locale, and the sign genuinely
    // flips: `'aa070000'` vs `'ab070000'` compares one way under `en` and the other under `da`,
    // where the `aa` digraph collates as `å`. Dependency IDs are UUIDs, so `aa` sequences are
    // routine — and two instances with different `LANG` would resolve the same (0,0) tie
    // differently, which is R2-5's dual-skip catastrophe moved from across-polls to across-hosts.
    const edge = (id: string): EvaluatedEdge => ({
        id, taskId: `t-${id}`, dependsOnTaskId: 'A', exclusiveGroup: 'g',
        originStatus: 'Complete', priority: 0, sequence: 0, conditionOutcome: 'satisfied',
    });

    it('orders the digraph pair by codepoint, which is what every locale must agree on', () => {
        // The exact pair that flips under Danish collation. `'aa…' < 'ab…'` by codepoint, always.
        expect(CompareEdgePrecedence(edge('aa070000'), edge('ab070000'))).toBeLessThan(0);
        expect(CompareEdgePrecedence(edge('ab070000'), edge('aa070000'))).toBeGreaterThan(0);
    });

    it('does not consult Intl at all', () => {
        // Stronger than comparing outputs: if the comparator ever calls back into collation, this
        // sees it. A locale-dependent sort cannot be caught by a same-process order-flip test,
        // which is why R2-5's shipped test missed this.
        const original = String.prototype.localeCompare;
        let consulted = false;
        // eslint-disable-next-line no-extend-native
        String.prototype.localeCompare = function (this: string, ...args: Parameters<typeof original>) {
            consulted = true;
            return original.apply(this, args);
        };
        try {
            CompareEdgePrecedence(edge('aa070000'), edge('ab070000'));
        } finally {
            // eslint-disable-next-line no-extend-native
            String.prototype.localeCompare = original;
        }
        expect(consulted).toBe(false);
    });

    it('still honours priority and sequence ahead of the id', () => {
        const high = { ...edge('zz'), priority: 10 };
        expect(CompareEdgePrecedence(high, edge('aa'))).toBeLessThan(0);
    });
});
