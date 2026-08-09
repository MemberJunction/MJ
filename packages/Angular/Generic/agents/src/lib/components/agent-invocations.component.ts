/**
 * @fileoverview "Everywhere this agent runs without anyone pressing Run."
 *
 * **The gap this closes.** MJ has never lacked ways to invoke an agent automatically — Scheduled
 * Jobs, User Routines, Entity Action bindings, Record Processes, a Sub-Agent step inside another
 * agent's flow. What it lacked was the *inverse* index. Every one of those substrates knows which
 * agent it calls; none of them can be asked the question from the other end, so standing on an agent
 * record there was no way to learn what fires it short of checking five admin surfaces by hand. In
 * practice that means nobody checked — and an agent quietly running on a schedule somebody set up
 * months ago is exactly the thing an owner needs to see first.
 *
 * **Read-only, by design.** This surface answers a question; it does not change any answer. Editing
 * a schedule belongs in Scheduling, editing a binding belongs in Entity Actions, and putting a
 * second editor here would be a second set of rules about what a valid trigger is. Every row instead
 * emits {@link AgentInvocationsComponent.RecordOpenRequested} so the host can navigate to the
 * substrate that owns it.
 *
 * **Layer: `widgets`.** No Router, no `NavigationService`, no global provider. Navigation leaves as
 * intent; data is read through `this.ProviderToUse`.
 *
 * @module @memberjunction/ng-agents
 */
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    Output,
} from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type {
    MJAIAgentRelationshipEntity,
    MJAIAgentStepEntity,
    MJEntityActionEntity,
    MJEntityActionInvocationEntity,
    MJEntityActionParamEntity,
    MJRecordProcessEntity,
    MJScheduledJobEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import {
    DescribeCron,
    DescribeInvocationTypes,
    DescribeWhen,
    GroupInvocations,
    IsUUID,
    ResolveInvocationState,
    SummarizeInvocations,
    type AgentInvocationGroup,
    type AgentInvocationPathway,
    type AgentInvocationSummary,
} from './agent-invocations.model';

/** Emitted when a row is activated. The host decides how to open it — this widget has no Router. */
export class AgentInvocationOpenRequestedEventArgs {
    constructor(
        public readonly EntityName: string,
        public readonly RecordID: string,
        public readonly Pathway: AgentInvocationPathway,
    ) {}
}

@Component({
    standalone: false,
    selector: 'mj-agent-invocations',
    templateUrl: './agent-invocations.component.html',
    styleUrls: ['./agent-invocations.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentInvocationsComponent extends BaseAngularComponent {
    /**
     * The agent to index. Setter-based per repo convention — the reaction is explicit and runs only
     * when the id actually changes, rather than on every change-detection pass.
     */
    @Input()
    public set AgentID(value: string | null) {
        if (value === this.agentID) return;
        this.agentID = value;
        this.HasLoaded = false;
        if (value && this.Active) void this.Load();
    }
    public get AgentID(): string | null {
        return this.agentID;
    }

    /**
     * Whether the surface is currently on screen.
     *
     * The host keeps this component alive across tab switches (so a return trip is instant), which
     * means without this it would issue six queries for a tab nobody has opened. Flipping to true
     * triggers the first load; flipping back does nothing.
     */
    @Input()
    public set Active(value: boolean) {
        this.active = value;
        if (value && this.agentID && !this.HasLoaded && !this.IsLoading) void this.Load();
    }
    public get Active(): boolean {
        return this.active;
    }

    /** The agent's own `ExposeAsAction` flag — a pathway that lives on the agent, not in another table. */
    @Input() public ExposeAsAction: boolean = false;

    /** The agent's parent, when it is a child sub-agent. Named so the row can say who calls it. */
    @Input() public ParentAgentName: string | null = null;
    @Input() public ParentAgentID: string | null = null;

    /** Intent only — the host navigates. */
    @Output() public RecordOpenRequested = new EventEmitter<AgentInvocationOpenRequestedEventArgs>();

    public IsLoading = false;
    public HasLoaded = false;
    public LoadError: string | null = null;
    public Groups: AgentInvocationGroup[] = [];
    public Summary: AgentInvocationSummary = { Total: 0, Live: 0, IsAutomated: false, NextRunAt: null };

    private agentID: string | null = null;
    private active = false;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    /**
     * Rebuilds the index.
     *
     * Public so a host can offer Refresh, and so an agent-context tool can drive it — the same
     * entry point either way, rather than a private loader plus a public wrapper that can drift.
     */
    public async Load(): Promise<void> {
        const id = this.agentID;
        if (!id || !IsUUID(id)) {
            this.Groups = [];
            this.Summary = SummarizeInvocations([]);
            this.HasLoaded = true;
            this.cdr.markForCheck();
            return;
        }

        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const pathways = [
                ...(await this.loadDirectPathways(id)),
                ...(await this.loadDataChangePathways(id)),
                ...this.loadAgentPathways(),
            ];
            this.Groups = GroupInvocations(pathways);
            this.Summary = SummarizeInvocations(pathways);
            this.HasLoaded = true;
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
            this.Groups = [];
            this.Summary = SummarizeInvocations([]);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * The four substrates that name the agent by id on their own row, in one round trip.
     *
     * Batched through `RunViews` rather than four awaited calls: this is one screen, and four
     * sequential round trips is the difference between a tab that opens and a tab that loads.
     */
    private async loadDirectPathways(agentID: string): Promise<AgentInvocationPathway[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const [jobs, routines, processes, steps, relationships] = await rv.RunViews([
            {
                EntityName: 'MJ: Scheduled Jobs',
                // `Configuration` is free-form JSON, so there is no column to equal. The id is
                // UUID-checked above, which is what makes this concatenation safe.
                ExtraFilter: `Configuration LIKE '%${agentID}%'`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: User Routines',
                ExtraFilter: `TargetType='Agent' AND TargetID='${agentID}'`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: Record Processes',
                ExtraFilter: `WorkType='Agent' AND AgentID='${agentID}'`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: AI Agent Steps',
                ExtraFilter: `SubAgentID='${agentID}'`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: AI Agent Relationships',
                ExtraFilter: `SubAgentID='${agentID}'`,
                ResultType: 'entity_object',
            },
        ]);

        const out: AgentInvocationPathway[] = [];

        if (jobs.Success) {
            for (const job of jobs.Results as MJScheduledJobEntity[]) {
                out.push({
                    Kind: 'Schedule',
                    Title: job.Name,
                    Trigger: DescribeCron(job.CronExpression, job.Timezone),
                    State: ResolveInvocationState(job.Status),
                    StateDetail: this.explainState(job.Status),
                    EntityName: 'MJ: Scheduled Jobs',
                    RecordID: job.ID,
                    LastRunAt: job.LastRunAt,
                    NextRunAt: job.NextRunAt,
                });
            }
        }

        if (routines.Success) {
            for (const routine of routines.Results as MJUserRoutineEntity[]) {
                out.push({
                    Kind: 'Routine',
                    Title: routine.Name,
                    // A Monitoring routine still runs on a cron; what differs is that it only speaks
                    // up when its condition holds, which is worth saying rather than implying.
                    Trigger:
                        routine.RoutineType === 'Monitoring'
                            ? `${DescribeCron(routine.CronExpression, routine.Timezone)} — reports only when something changed`
                            : DescribeCron(routine.CronExpression, routine.Timezone),
                    State: ResolveInvocationState(routine.Status),
                    StateDetail: this.explainState(routine.Status),
                    EntityName: 'MJ: User Routines',
                    RecordID: routine.ID,
                    LastRunAt: routine.LastRunAt,
                    NextRunAt: routine.NextRunAt,
                });
            }
        }

        if (processes.Success) {
            for (const process of processes.Results as MJRecordProcessEntity[]) {
                out.push({
                    Kind: 'BulkOperation',
                    Title: process.Name,
                    Trigger: `Across ${process.Entity} records, when the operation is run`,
                    State: ResolveInvocationState(process.Status),
                    StateDetail: this.explainState(process.Status),
                    EntityName: 'MJ: Record Processes',
                    RecordID: process.ID,
                });
            }
        }

        if (steps.Success) {
            for (const step of steps.Results as MJAIAgentStepEntity[]) {
                out.push({
                    Kind: 'CalledByAgent',
                    Title: step.Agent ?? 'Another agent',
                    Trigger: `As the "${step.Name}" step`,
                    State: ResolveInvocationState(step.Status),
                    StateDetail: this.explainState(step.Status),
                    // The step's owner is what someone wants to open, not the step row — the step is
                    // only reachable, and only meaningful, inside that agent's editor.
                    EntityName: 'MJ: AI Agents',
                    RecordID: step.AgentID,
                });
            }
        }

        if (relationships.Success) {
            for (const rel of relationships.Results as MJAIAgentRelationshipEntity[]) {
                out.push({
                    Kind: 'CalledByAgent',
                    Title: rel.Agent ?? 'Another agent',
                    Trigger: 'As a related sub-agent',
                    State: ResolveInvocationState(rel.Status),
                    StateDetail: this.explainState(rel.Status),
                    EntityName: 'MJ: AI Agents',
                    RecordID: rel.AgentID,
                });
            }
        }

        return out;
    }

    /**
     * Entity-change bindings, which name the agent one table further out.
     *
     * An Entity Action does not reference an agent; it references the `Execute Agent` action, and the
     * agent lives in that binding's `AgentID` **parameter**. So this walks params → bindings →
     * invocation types. Three steps, but each one is a single batched query, and skipping straight to
     * the bindings would find every agent-dispatching binding rather than this agent's.
     */
    private async loadDataChangePathways(agentID: string): Promise<AgentInvocationPathway[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const params = await rv.RunView<MJEntityActionParamEntity>({
            EntityName: 'MJ: Entity Action Params',
            ExtraFilter: `ActionParam='AgentID' AND Value='${agentID}'`,
            ResultType: 'entity_object',
        });
        if (!params.Success || (params.Results ?? []).length === 0) return [];

        const bindingIDs = [...new Set((params.Results ?? []).map((p) => p.EntityActionID))].filter(IsUUID);
        if (bindingIDs.length === 0) return [];
        const idList = bindingIDs.map((id) => `'${id}'`).join(',');

        const [bindings, invocations] = await rv.RunViews([
            {
                EntityName: 'MJ: Entity Actions',
                ExtraFilter: `ID IN (${idList})`,
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: Entity Action Invocations',
                ExtraFilter: `EntityActionID IN (${idList})`,
                ResultType: 'entity_object',
            },
        ]);
        if (!bindings.Success) return [];

        const invocationsByBinding = new Map<string, MJEntityActionInvocationEntity[]>();
        if (invocations.Success) {
            for (const inv of invocations.Results as MJEntityActionInvocationEntity[]) {
                const list = invocationsByBinding.get(inv.EntityActionID) ?? [];
                list.push(inv);
                invocationsByBinding.set(inv.EntityActionID, list);
            }
        }

        return (bindings.Results as MJEntityActionEntity[]).map((binding) => {
            // Only the ACTIVE invocation types describe when this actually fires. Including disabled
            // ones would tell someone the agent runs on delete when that hook is switched off.
            const live = (invocationsByBinding.get(binding.ID) ?? []).filter((i) => i.Status === 'Active');
            return {
                Kind: 'DataChange' as const,
                Title: binding.Entity,
                Trigger: DescribeInvocationTypes(live.map((i) => i.InvocationType)),
                State: ResolveInvocationState(binding.Status),
                StateDetail: this.explainState(binding.Status),
                EntityName: 'MJ: Entity Actions',
                RecordID: binding.ID,
            };
        });
    }

    /** The pathways carried on the agent's own record rather than in another table. */
    private loadAgentPathways(): AgentInvocationPathway[] {
        const out: AgentInvocationPathway[] = [];

        if (this.ExposeAsAction) {
            out.push({
                Kind: 'ExposedAsAction',
                Title: 'Exposed as an action',
                Trigger: 'Any action caller — another agent, a binding, an integration — can run this',
                State: 'Live',
            });
        }

        if (this.ParentAgentName) {
            out.push({
                Kind: 'CalledByAgent',
                Title: this.ParentAgentName,
                Trigger: 'As a child sub-agent',
                State: 'Live',
                EntityName: this.ParentAgentID ? 'MJ: AI Agents' : undefined,
                RecordID: this.ParentAgentID ?? undefined,
            });
        }

        return out;
    }

    /** Says why a pathway will not fire. Returns undefined when it will — there is nothing to explain. */
    private explainState(status: string | null | undefined): string | undefined {
        const normalized = (status ?? '').trim();
        switch (ResolveInvocationState(normalized)) {
            case 'Live':
                return undefined;
            case 'Paused':
                return 'Paused — it will not fire until someone resumes it';
            default:
                return normalized ? `${normalized} — it will not fire` : 'Switched off';
        }
    }

    public OnRowActivated(pathway: AgentInvocationPathway): void {
        if (!pathway.EntityName || !pathway.RecordID) return;
        this.RecordOpenRequested.emit(
            new AgentInvocationOpenRequestedEventArgs(pathway.EntityName, pathway.RecordID, pathway),
        );
    }

    /** Template helper — coarse relative time, computed at render rather than stored. */
    public When(value: Date | null | undefined): string | null {
        return DescribeWhen(value, new Date());
    }

    /** Template helper: the header line, phrased for whichever case the agent is in. */
    public get SummaryLine(): string {
        if (this.Summary.Total === 0) {
            return 'Nothing runs this agent automatically — it only runs when someone asks it to.';
        }
        if (this.Summary.Live === 0) {
            const n = this.Summary.Total;
            return `${n} pathway${n === 1 ? '' : 's'} point here, but none of them can fire right now.`;
        }
        const next = this.When(this.Summary.NextRunAt);
        const base = `${this.Summary.Live} of ${this.Summary.Total} pathway${this.Summary.Total === 1 ? '' : 's'} can run this agent without anyone asking`;
        return next ? `${base}. Next scheduled run ${next}.` : `${base}.`;
    }
}
