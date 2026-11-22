#!/usr/bin/env node
/**
 * Reproducible headless Chromium / Playwright verification harness for Epic 1a AdminLimits.
 *
 * Drives the ACTUAL Angular `AdminLimitsResourceComponent` (compiled from
 * `admin-limits-resource.component.ts` + `.html` + `.css`) inside an Explorer shell
 * populated from `metadata/applications/.admin-application.json` `DefaultNavItems`,
 * served through Vite with compiled `--mj-*` design tokens (`_tokens.scss`) and
 * `@memberjunction/ng-ui-components` button/layout chrome.
 *
 * All browser `BaseRemotableOperation` calls route via `AdminLimitsService` ->
 * `provider.RouteOperation` -> `POST /api/remote-op` -> `DispatchRemoteOperationInProcess` ->
 * production `@memberjunction/ai-agents` `LimitsOperations.ts` (`LimitsGetDiagnosticsServerOperation`,
 * `LimitsResumePausedRunServerOperation`, `LimitsPauseRunServerOperation`) + real
 * `RunawayCheckpointManager`, `ActiveRunGovernanceRegistry`, and `DefaultResumeContinuationDispatcher`.
 */
import http from 'node:http';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

import {
    DispatchRemoteOperationInProcess,
    LimitsConfigResolver,
    RunView,
} from '../../../packages/MJCore/dist/index.js';
import { RegisterClass } from '../../../packages/MJGlobal/dist/index.js';
import {
    AppendProgressDiagnosticToRunData,
    AttachLimitsDiagnosticsToRunData,
    BuildLimitsDiagnosticsSnapshot,
    ExtractRunawayCheckpointFromRunData,
} from '../../../packages/AI/CorePlus/dist/index.js';
import {
    ActiveRunGovernanceRegistry,
    BaseAgent,
    InstallDefaultResumeContinuationDispatcher,
    LoadLimitsOperations,
    RunawayCheckpointManager,
} from '../../../packages/AI/Agents/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../..');
const DASHBOARDS_DIR = resolve(REPO_ROOT, 'packages/Angular/Explorer/dashboards');
const FONTAWESOME_DIR = resolve(DASHBOARDS_DIR, 'node_modules/@fortawesome/fontawesome-free');
const ADMIN_APP_METADATA_PATH = resolve(REPO_ROOT, 'metadata/applications/.admin-application.json');

const OWNER_USER = {
    ID: '11111111-1111-4111-8111-111111111111',
    Name: 'Alice Owner',
    Email: 'alice@example.com',
    Type: 'Owner',
    UserRoles: [],
};

const AGENT_ID_PLANNER = '55555555-5555-4555-8555-555555555551';
const AGENT_ID_WORKER = '55555555-5555-4555-8555-555555555552';
const RUN_ID_PAUSED = '33333333-3333-4333-8333-333333333333';
const RUN_ID_ACTIVE = '44444444-4444-4444-8444-444444444444';

class BrowserVerifyPlannerAgent extends BaseAgent {
    async ResumePausedRun(params) {
        const run = await params.provider.GetEntityObject('MJ: AI Agent Runs', params.contextUser);
        if (params.resumeCheckpointRunId) {
            await run.Load(params.resumeCheckpointRunId);
        }
        return {
            success: true,
            agentRun: run,
        };
    }
}
RegisterClass(BaseAgent, 'BrowserVerifyPlannerAgent')(BrowserVerifyPlannerAgent);

async function resolveViteCreateServer() {
    const viteWrapper = readFileSync(resolve(REPO_ROOT, 'node_modules/.bin/vite'), 'utf8');
    const match = /"(\$basedir\/[^"]+\/vite\/bin\/vite\.js)"/.exec(viteWrapper);
    if (!match?.[1]) {
        throw new Error('Could not locate vite bin entry from node_modules/.bin/vite');
    }
    const viteBin = resolve(REPO_ROOT, 'node_modules/.bin', match[1].replace('$basedir/', ''));
    const viteIndex = resolve(dirname(viteBin), '../dist/node/index.js');
    const viteMod = await import(pathToFileURL(viteIndex).href);
    return viteMod.createServer;
}

function compileDesignSystemCss() {
    const req = createRequire(resolve(DASHBOARDS_DIR, 'package.json'));
    const sass = req('sass');
    const tokensScss = resolve(REPO_ROOT, 'packages/Angular/Generic/shared/src/lib/_tokens.scss');
    const buttonScss = resolve(REPO_ROOT, 'packages/Angular/Generic/ui-components/src/lib/button/button.scss');
    const tokensCss = sass.compile(tokensScss).css;
    const buttonCss = sass.compile(buttonScss).css;
    return `${tokensCss}\n${buttonCss}\n`;
}

async function createProductionBackedStore() {
    LoadLimitsOperations();
    InstallDefaultResumeContinuationDispatcher(true);
    ActiveRunGovernanceRegistry.Instance.ClearPendingCheckpointPersistence();
    ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
    ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);

    LimitsConfigResolver.Instance.ClearMjConfigLimits();
    LimitsConfigResolver.Instance.RegisterMjConfigLimits({
        AgentChannelConsecutiveTurns: 1500,
        Budgets: {
            PerRun: { MaxCostUsd: 25 },
            PerUserPerDay: { MaxCostUsd: 100 },
        },
    });

    const agents = new Map([
        [
            AGENT_ID_PLANNER.toLowerCase(),
            {
                ID: AGENT_ID_PLANNER,
                Name: 'ResearchPlanner',
                DriverClass: 'BrowserVerifyPlannerAgent',
                MaxCostPerRun: 50,
                MaxTokensPerRun: null,
                MaxTimePerRun: null,
                MaxIterationsPerRun: null,
                TypeConfiguration: null,
            },
        ],
        [
            AGENT_ID_WORKER.toLowerCase(),
            {
                ID: AGENT_ID_WORKER,
                Name: 'ResearchWorker',
                DriverClass: 'BrowserVerifyPlannerAgent',
                MaxCostPerRun: null,
                MaxTokensPerRun: null,
                MaxTimePerRun: null,
                MaxIterationsPerRun: null,
                TypeConfiguration: null,
            },
        ],
    ]);

    const policies = [
        {
            ID: '66666666-6666-4666-8666-666666666666',
            AgentID: AGENT_ID_PLANNER,
            UserID: OWNER_USER.ID,
            Status: 'Active',
            InstructionsOverride: '<!-- mj-limits: {"Budgets":{"PerRun":{"MaxCostUsd":20}}} -->',
        },
    ];

    const runs = new Map();
    const wrapAgentRunEntity = (initial) => {
        const backing = initial ? { ...initial } : {
            ID: '',
            AgentID: AGENT_ID_PLANNER,
            Agent: 'ResearchPlanner',
            UserID: OWNER_USER.ID,
            User: 'Alice Owner',
            Status: 'Running',
            StartedAt: new Date(),
            CompletedAt: null,
            TotalCost: 0,
            TotalCostRollup: 0,
            TotalTokensUsed: 0,
            TotalPromptIterations: 0,
            Data: null,
            Message: null,
            Success: null,
            ErrorMessage: null,
            FinalPayload: null,
            FinalPayloadObject: null,
            Steps: [],
        };
        let cpCache = null;
        return {
            get ID() { return backing.ID; },
            set ID(v) { backing.ID = v; },
            get AgentID() { return backing.AgentID; },
            set AgentID(v) { backing.AgentID = v; },
            get Agent() { return backing.Agent; },
            set Agent(v) { backing.Agent = v; },
            get UserID() { return backing.UserID; },
            set UserID(v) { backing.UserID = v; },
            get User() { return backing.User; },
            set User(v) { backing.User = v; },
            get Status() { return backing.Status; },
            set Status(v) { backing.Status = v; },
            get StartedAt() { return backing.StartedAt; },
            set StartedAt(v) { backing.StartedAt = v; },
            get CompletedAt() { return backing.CompletedAt; },
            set CompletedAt(v) { backing.CompletedAt = v; },
            get TotalCost() { return backing.TotalCost; },
            set TotalCost(v) { backing.TotalCost = v; },
            get TotalCostRollup() { return backing.TotalCostRollup; },
            set TotalCostRollup(v) { backing.TotalCostRollup = v; },
            get TotalTokensUsed() { return backing.TotalTokensUsed; },
            set TotalTokensUsed(v) { backing.TotalTokensUsed = v; },
            get TotalPromptIterations() { return backing.TotalPromptIterations; },
            set TotalPromptIterations(v) { backing.TotalPromptIterations = v; },
            get Data() { return backing.Data; },
            set Data(v) { backing.Data = v; },
            get Message() { return backing.Message; },
            set Message(v) { backing.Message = v; },
            get Success() { return backing.Success; },
            set Success(v) { backing.Success = v; },
            get ErrorMessage() { return backing.ErrorMessage; },
            set ErrorMessage(v) { backing.ErrorMessage = v; },
            get FinalPayload() { return backing.FinalPayload; },
            set FinalPayload(v) { backing.FinalPayload = v; },
            get FinalPayloadObject() { return backing.FinalPayloadObject; },
            set FinalPayloadObject(v) { backing.FinalPayloadObject = v; },
            get Steps() { return backing.Steps; },
            get RunawayCheckpoint() {
                return cpCache ?? ExtractRunawayCheckpointFromRunData(backing.Data);
            },
            set RunawayCheckpoint(v) {
                cpCache = v;
            },
            LatestResult: { CompleteMessage: '' },
            Load: async (id) => {
                const row = runs.get(id.toLowerCase());
                if (!row) return false;
                Object.assign(backing, row);
                cpCache = null;
                return true;
            },
            Save: async () => {
                runs.set(backing.ID.toLowerCase(), { ...backing });
                return true;
            },
        };
    };

    const provider = {
        Entities: [],
        Authorizations: [],
        GetEntityObject: async (entityName) => {
            if (entityName === 'MJ: AI Agent Runs') {
                return wrapAgentRunEntity();
            }
            return { ID: '00000000-0000-4000-8000-000000000001', LatestResult: { CompleteMessage: '' }, Load: async () => false, Save: async () => true };
        },
        RouteOperation: async (operationKey, input) => {
            return DispatchRemoteOperationInProcess(
                operationKey,
                input,
                { provider, user: OWNER_USER },
                provider,
                OWNER_USER,
            );
        },
        RunView: async (params) => {
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            if (params.EntityName === 'MJ: AI Agents') {
                const idMatch = /ID='([^']+)'/.exec(filter);
                const list = idMatch?.[1]
                    ? Array.from(agents.values()).filter((a) => a.ID.toLowerCase() === idMatch[1].toLowerCase())
                    : Array.from(agents.values());
                return { Success: true, Results: list, RowCount: list.length, TotalRowCount: list.length, ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return { Success: true, Results: policies, RowCount: policies.length, TotalRowCount: policies.length, ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent Runs') {
                let list = Array.from(runs.values());
                if (filter.includes("Status='Paused'")) {
                    list = list.filter((r) => r.Status === 'Paused');
                }
                return { Success: true, Results: list, RowCount: list.length, TotalRowCount: list.length, ExecutionTime: 0, ErrorMessage: '' };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
        },
        RunViews: async (items) => Promise.all(items.map((item) => provider.RunView(item))),
    };

    const origFromMetadataProvider = RunView.FromMetadataProvider;
    RunView.FromMetadataProvider = () => provider;

    // Seed paused run via REAL RunawayCheckpointManager.PauseRunWithCheckpoint
    const resolution = LimitsConfigResolver.Instance.Resolve(
        {
            UserAgentPolicy: { Budgets: { PerRun: { MaxCostUsd: 20 } } },
            RunOverride: { Budgets: { PerRun: { MaxCostUsd: 50 } } },
        },
        { EnforceUserPolicyAsCeiling: true },
    );
    const snapshot = BuildLimitsDiagnosticsSnapshot(resolution, {
        AgentID: AGENT_ID_PLANNER,
        AgentName: 'ResearchPlanner',
        AgentRunID: RUN_ID_PAUSED,
        UserID: OWNER_USER.ID,
    });
    let pausedData = AttachLimitsDiagnosticsToRunData(null, snapshot);
    pausedData = AppendProgressDiagnosticToRunData(
        pausedData,
        {
            Checked: true,
            WindowSize: 6,
            SampleCount: 6,
            Classification: 'Stalled',
            ProgressScore: 0.42,
            Reason: 'Ambiguous window evaluated by fast judge',
            Signals: {
                RecordsCreatedOrChangedTotal: 0,
                RecordsCreatedOrChangedRate: 0,
                TasksClosedTotal: 0,
                TasksClosedRate: 0,
                DistinctOutputsCount: 2,
                DistinctOutputRatio: 0.33,
                RepeatedTextSimilarity: 0.89,
                TokensSpentTotal: 9000,
                ProgressUnitsTotal: 0,
                TokensPerProgressUnit: Number.POSITIVE_INFINITY,
                TokenEfficiencyScore: 0,
                OutputLengthVariance: 12,
                HeapDeltaBytes: 1024,
                HeapGrowthRatio: 0.01,
                VarianceHealthScore: 0.4,
                DuplicateStepRatio: 0.83,
                ZeroPayloadDeltaStreak: 5,
                RepeatingErrorStreak: 0,
            },
            FastJudgeInvoked: true,
            FastJudgeResult: {
                Converging: false,
                Reason: 'Oscillating without writing new records',
                LatencyMs: 18,
                TimedOut: false,
                UsedFallback: false,
                Source: 'Model',
            },
        },
        6,
    );

    const checkpointMgr = new RunawayCheckpointManager();
    runs.set(RUN_ID_PAUSED.toLowerCase(), {
        ID: RUN_ID_PAUSED,
        AgentID: AGENT_ID_PLANNER,
        Agent: 'ResearchPlanner',
        UserID: OWNER_USER.ID,
        User: 'Alice Owner',
        Status: 'Running',
        StartedAt: new Date(Date.now() - 60_000),
        CompletedAt: null,
        TotalCost: 0.75,
        TotalCostRollup: 0.75,
        TotalTokensUsed: 9000,
        TotalPromptIterations: 6,
        Data: pausedData,
        Message: null,
        Success: null,
        ErrorMessage: null,
        FinalPayload: null,
        FinalPayloadObject: null,
        Steps: [],
    });
    const pausedRunEntity = await provider.GetEntityObject('MJ: AI Agent Runs', OWNER_USER);
    await pausedRunEntity.Load(RUN_ID_PAUSED);
    await checkpointMgr.PauseRunWithCheckpoint({
        AgentRun: pausedRunEntity,
        AgentID: AGENT_ID_PLANNER,
        AgentName: 'ResearchPlanner',
        UserID: OWNER_USER.ID,
        RoutineID: null,
        PauseReason: 'FastJudgeStalled',
        Summary: 'Paused by fast judge after oscillating iterations',
        CompletedPromptTurns: 6,
        CompletedNodeIDs: ['step-1', 'step-2'],
        ConversationMessages: [{ role: 'user', content: 'Research market trends' }],
        InFlightPayload: { partialCount: 4 },
        Scratchpad: { notes: 'Halfway done', tasks: [] },
        CumulativeLedger: {
            RunCostUsd: 0.75,
            RunWallClockMs: 4200,
            RunTokens: 9000,
            RoutineCostUsd: 0.75,
            RoutineWallClockMs: 4200,
            UserDailyCostUsd: 0.75,
            UserDailyWallClockMs: 4200,
            PausedWallClockMs: 0,
            PausedIntervals: [],
            DayBucketUTC: new Date().toISOString().slice(0, 10),
            DayBoundaryTimezone: 'UTC',
            AsOfISO: new Date().toISOString(),
        },
        Provider: provider,
        ContextUser: OWNER_USER,
    });

    // Seed active running run with real cooperative pause handler via RunawayCheckpointManager
    runs.set(RUN_ID_ACTIVE.toLowerCase(), {
        ID: RUN_ID_ACTIVE,
        AgentID: AGENT_ID_WORKER,
        Agent: 'ResearchWorker',
        UserID: OWNER_USER.ID,
        User: 'Alice Owner',
        Status: 'Running',
        StartedAt: new Date(Date.now() - 30_000),
        CompletedAt: null,
        TotalCost: 0.4,
        TotalCostRollup: 0.4,
        TotalTokensUsed: 2500,
        TotalPromptIterations: 4,
        Data: AttachLimitsDiagnosticsToRunData(null, snapshot),
        Message: null,
        Success: null,
        ErrorMessage: null,
        FinalPayload: null,
        FinalPayloadObject: null,
        Steps: [],
    });

    ActiveRunGovernanceRegistry.Instance.RegisterActiveRun(
        {
            AgentRunID: RUN_ID_ACTIVE,
            Provider: provider,
            RequestPause: async (summary) => {
                const activeEntity = await provider.GetEntityObject('MJ: AI Agent Runs', OWNER_USER);
                await activeEntity.Load(RUN_ID_ACTIVE);
                const outcome = await checkpointMgr.PauseRunWithCheckpoint({
                    AgentRun: activeEntity,
                    AgentID: AGENT_ID_WORKER,
                    AgentName: 'ResearchWorker',
                    UserID: OWNER_USER.ID,
                    RoutineID: null,
                    PauseReason: 'ManualPause',
                    Summary: summary || 'Paused non-destructively from Admin Limits console',
                    CompletedPromptTurns: 4,
                    ConversationMessages: [{ role: 'user', content: 'Worker research' }],
                    InFlightPayload: { step: 4 },
                    Scratchpad: { notes: 'active worker', tasks: [] },
                    CumulativeLedger: {
                        RunCostUsd: 0.4,
                        RunWallClockMs: 2100,
                        RunTokens: 2500,
                        RoutineCostUsd: 0.4,
                        RoutineWallClockMs: 2100,
                        UserDailyCostUsd: 0.4,
                        UserDailyWallClockMs: 2100,
                        PausedWallClockMs: 0,
                        PausedIntervals: [],
                        DayBucketUTC: new Date().toISOString().slice(0, 10),
                        DayBoundaryTimezone: 'UTC',
                        AsOfISO: new Date().toISOString(),
                    },
                    Provider: provider,
                    ContextUser: OWNER_USER,
                });
                return {
                    Paused: outcome.Saved,
                    CheckpointID: outcome.Checkpoint.CheckpointID,
                    Status: activeEntity.Status,
                    Summary: outcome.Checkpoint.Summary,
                };
            },
        },
        provider,
    );

    void BrowserVerifyPlannerAgent;

    return {
        provider,
        cleanup: () => {
            RunView.FromMetadataProvider = origFromMetadataProvider;
            ActiveRunGovernanceRegistry.Instance.ClearContinuationDispatchers();
            ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
            ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(RUN_ID_ACTIVE, provider);
        },
    };
}

function writeTempHarnessFiles(harnessDir) {
    mkdirSync(harnessDir, { recursive: true });

    const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MJ Explorer — Admin: Execution Limits & Governance</title>
  <link rel="stylesheet" href="/fa/css/all.min.css" />
  <link rel="stylesheet" href="/mj-tokens.css" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--mj-bg-page); color: var(--mj-text-primary); }
    .explorer-shell { display: flex; flex-direction: column; min-height: 100vh; background: var(--mj-bg-page); }
    .explorer-topbar { height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; background: var(--mj-bg-surface); border-bottom: 1px solid var(--mj-border-default); }
    .explorer-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 14px; color: var(--mj-text-primary); }
    .explorer-brand-badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border: 1px solid var(--mj-status-info-border); }
    .explorer-workspace { display: flex; flex: 1; min-height: 0; }
    .explorer-left-nav { width: 224px; flex-shrink: 0; background: var(--mj-bg-surface); border-right: 1px solid var(--mj-border-default); padding: 14px 10px; display: flex; flex-direction: column; gap: 4px; }
    .nav-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mj-text-muted); padding: 4px 10px 8px; }
    .nav-item-btn { display: flex; align-items: center; gap: 10px; width: 100%; border: 1px solid transparent; background: transparent; color: var(--mj-text-secondary); padding: 9px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; text-align: left; }
    .nav-item-btn:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
    .nav-item-btn.active { background: var(--mj-bg-surface-active); color: var(--mj-brand-primary); border-color: var(--mj-status-info-border); font-weight: 600; }
    .explorer-main { flex: 1; min-width: 0; padding: 16px 20px; overflow: auto; }
  </style>
</head>
<body>
  <mj-browser-verify-shell></mj-browser-verify-shell>
  <script type="module" src="/.browser-harness-tmp/main.ts"></script>
</body>
</html>`;

    const mainTs = `import '@angular/compiler';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    NgModule,
    OnInit,
    ViewChild,
    ViewContainerRef,
    inject,
    provideZonelessChangeDetection,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { bootstrapApplication } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import {
    Metadata,
    SetProvider,
    type IMetadataProvider,
    type IRemoteOperationProvider,
    type RemoteOpResult,
} from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import {
    MJButtonDirective,
    MJPageBodyComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageSearchComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import {
    AdminLimitsResourceComponent,
    LoadAdminLimitsResource,
} from '../dist/AdminLimits/admin-limits-resource.component.js';

interface AdminNavItem {
    Label: string;
    Icon: string;
    ResourceType: string;
    DriverClass: string;
    isDefault: boolean;
}

const inMemorySettings = new Map<string, string>();
UserInfoEngine.Instance.GetSetting = (key: string) => inMemorySettings.get(key);
UserInfoEngine.Instance.SetSettingDebounced = (key: string, val: string) => {
    inMemorySettings.set(key, val);
};

const browserProvider = {
    Entities: [],
    Authorizations: [],
    CurrentUser: {
        ID: '${OWNER_USER.ID}',
        Name: '${OWNER_USER.Name}',
        Email: '${OWNER_USER.Email}',
        Type: 'Owner',
    },
    RouteOperation: async <TInput, TOutput>(
        operationKey: string,
        input: TInput,
    ): Promise<RemoteOpResult<TOutput>> => {
        const resp = await fetch('/api/remote-op', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: operationKey, input }),
        });
        return (await resp.json()) as RemoteOpResult<TOutput>;
    },
} as Partial<IMetadataProvider & IRemoteOperationProvider> as IMetadataProvider & IRemoteOperationProvider;

SetProvider(browserProvider);
Reflect.defineProperty(Metadata, 'Provider', {
    get: () => browserProvider,
    configurable: true,
});

const navServiceStub = {
    QueryParamChanged$: new Subject(),
    SetAgentContext: () => undefined,
    SetAgentClientTools: () => undefined,
    UpdateTabQueryParams: () => undefined,
    ObserveTabQueryParams: () => new Subject(),
    IsTabShowingResource: () => true,
};

@NgModule({
    declarations: [AdminLimitsResourceComponent],
    imports: [
        CommonModule,
        FormsModule,
        MJButtonDirective,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJPageSearchComponent,
        MJStatBadgeComponent,
        MJRefreshButtonComponent,
    ],
    exports: [AdminLimitsResourceComponent],
})
class AdminLimitsHarnessModule {}

@Component({
    selector: 'mj-browser-verify-shell',
    standalone: true,
    imports: [CommonModule, AdminLimitsHarnessModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: \`
        <div class="explorer-shell" data-testid="explorer-shell-chrome">
            <header class="explorer-topbar">
                <div class="explorer-brand">
                    <i class="fa-solid fa-screwdriver-wrench"></i>
                    <span>MemberJunction Explorer — Admin</span>
                    <span class="explorer-brand-badge" data-testid="shell-route-badge">
                        {{ ActiveNavItem?.DriverClass || 'Loading...' }}
                    </span>
                </div>
            </header>
            <div class="explorer-workspace">
                <nav class="explorer-left-nav" aria-label="Admin Navigation" data-testid="admin-default-nav">
                    <div class="nav-section-label">Admin Application</div>
                    @for (item of NavItems; track item.DriverClass) {
                        <button
                            type="button"
                            class="nav-item-btn"
                            [class.active]="ActiveNavItem?.DriverClass === item.DriverClass"
                            [attr.data-driver-class]="item.DriverClass"
                            (click)="NavigateTo(item)"
                        >
                            <i [class]="item.Icon"></i>
                            <span>{{ item.Label }}</span>
                        </button>
                    }
                </nav>
                <main class="explorer-main">
                    <ng-container #resourceHost></ng-container>
                </main>
            </div>
        </div>
    \`,
})
class ExplorerAdminShellComponent implements OnInit {
    @ViewChild('resourceHost', { read: ViewContainerRef, static: true })
    public ResourceHost!: ViewContainerRef;

    public NavItems: AdminNavItem[] = [];
    public ActiveNavItem: AdminNavItem | null = null;
    private readonly cdr = inject(ChangeDetectorRef);

    public async ngOnInit(): Promise<void> {
        LoadAdminLimitsResource();
        const resp = await fetch('/api/admin-app-metadata');
        const metadata = (await resp.json()) as { fields: { DefaultNavItems: AdminNavItem[] } };
        this.NavItems = metadata.fields.DefaultNavItems;
        const limitsNav = this.NavItems.find((n) => n.DriverClass === 'AdminLimitsResource') ?? this.NavItems[0] ?? null;
        if (limitsNav) {
            this.NavigateTo(limitsNav);
        }
        this.cdr.markForCheck();
    }

    public NavigateTo(item: AdminNavItem): void {
        this.ActiveNavItem = item;
        this.ResourceHost.clear();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseResourceComponent, item.DriverClass);
        if (reg?.SubClass) {
            const compRef = this.ResourceHost.createComponent(reg.SubClass as typeof AdminLimitsResourceComponent);
            const data = new ResourceData();
            data.Name = item.Label;
            data.Configuration = { tabId: 'tab-admin-limits' };
            compRef.instance.Data = data;
            compRef.instance.ParentTabId = 'tab-admin-limits';
            compRef.changeDetectorRef.detectChanges();
        }
        this.cdr.markForCheck();
    }
}

void bootstrapApplication(ExplorerAdminShellComponent, {
    providers: [
        provideZonelessChangeDetection(),
        { provide: NavigationService, useValue: navServiceStub },
    ],
});
`;

    writeFileSync(resolve(harnessDir, 'index.html'), indexHtml, 'utf8');
    writeFileSync(resolve(harnessDir, 'main.ts'), mainTs, 'utf8');
}

async function main() {
    const { provider, cleanup } = await createProductionBackedStore();
    const designCss = compileDesignSystemCss();
    const adminAppJson = readFileSync(ADMIN_APP_METADATA_PATH, 'utf8');
    const gitHeadSha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

    const harnessDir = resolve(DASHBOARDS_DIR, '.browser-harness-tmp');
    writeTempHarnessFiles(harnessDir);

    const createServer = await resolveViteCreateServer();
    const vite = await createServer({
        root: DASHBOARDS_DIR,
        server: {
            middlewareMode: true,
            fs: {
                allow: [REPO_ROOT, resolve(REPO_ROOT, '..')],
            },
        },
        appType: 'custom',
    });

    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/') {
            const rawHtml = readFileSync(resolve(harnessDir, 'index.html'), 'utf8');
            const transformed = await vite.transformIndexHtml(req.url, rawHtml);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(transformed);
            return;
        }
        if (req.method === 'GET' && req.url === '/mj-tokens.css') {
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
            res.end(designCss);
            return;
        }
        if (req.method === 'GET' && req.url === '/api/admin-app-metadata') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(adminAppJson);
            return;
        }
        if (req.method === 'GET' && req.url?.startsWith('/fa/')) {
            const rel = req.url.slice('/fa/'.length);
            const fullPath = resolve(FONTAWESOME_DIR, rel);
            if (!fullPath.startsWith(FONTAWESOME_DIR)) {
                res.writeHead(403);
                res.end();
                return;
            }
            const ext = fullPath.split('.').pop();
            const mime = ext === 'css' ? 'text/css' : ext === 'woff2' ? 'font/woff2' : 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime });
            res.end(readFileSync(fullPath));
            return;
        }
        if (req.method === 'POST' && req.url === '/api/remote-op') {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const result = await provider.RouteOperation(body.key, body.input);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        vite.middlewares(req, res, () => {
            res.writeHead(404);
            res.end();
        });
    });

    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}/`;

    const pageErrors = [];
    const consoleErrors = [];
    const browser = await chromium.launch({ headless: true });

    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
        page.on('pageerror', (err) => {
            console.error('[browser pageerror]', err.message);
            pageErrors.push(err.message);
        });
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.error('[browser console.error]', msg.text());
                consoleErrors.push(msg.text());
            }
        });
        page.on('response', (resp) => {
            if (resp.status() >= 400) {
                console.error(`[browser HTTP ${resp.status()}] ${resp.url()}`);
            }
        });

        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForSelector('mj-admin-limits-resource .tier-card', { timeout: 15000 });

        // Verify Explorer shell + DefaultNavItems route navigation
        const shellRouteBadge = await page.locator('[data-testid="shell-route-badge"]').innerText();
        const navCount = await page.locator('[data-testid="admin-default-nav"] .nav-item-btn').count();
        await page.click('[data-driver-class="AdminLimitsResource"]');
        await page.waitForSelector('mj-admin-limits-resource .tier-card');

        const overviewStats = await page.evaluate(() => ({
            componentMounted: Boolean(document.querySelector('mj-admin-limits-resource mj-page-layout')),
            tierCards: document.querySelectorAll('.tier-card').length,
            backstopCards: document.querySelectorAll('.backstop-card').length,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            brandPrimary: getComputedStyle(document.documentElement).getPropertyValue('--mj-brand-primary').trim(),
            brokenImages: Array.from(document.querySelectorAll('img')).filter((img) => img.naturalWidth === 0).length,
        }));
        await page.screenshot({ path: resolve(__dirname, 'admin-limits-overview.png'), fullPage: true });

        // Tab 4 first: Select paused run (inspects drawer with Clamped UserAgentPolicy provenance + FastJudge + Checkpoint), then refresh
        await page.click('button.tab-pill:has-text("Active & Paused Runs")');
        await page.waitForSelector(`tbody tr:has-text("${RUN_ID_PAUSED}")`);
        await page.click(`tbody tr:has-text("${RUN_ID_PAUSED}")`);
        await page.waitForSelector('[data-testid="selected-run-limits-snapshot"]');
        const drawerText = await page.locator('.detail-drawer').innerText();
        await page.screenshot({ path: resolve(__dirname, 'admin-limits-runs-drawer.png'), fullPage: true });

        // Click Refresh while ResearchPlanner is selected so GetDiagnostics resolves Tier 3/4 overrides
        await page.click('mj-refresh-button button');

        // Tab 2: Tier Provenance & Overridden Only + Category Budgets filter
        await page.click('button.tab-pill:has-text("Tier Provenance")');
        await page.waitForSelector('#category-select');
        await page.selectOption('#category-select', 'Budgets');
        await page.click('button:has-text("Overridden Only")');
        await page.waitForFunction(() => {
            const rows = document.querySelectorAll('tbody tr');
            return rows.length > 0 && rows.length < 11 && rows[0].textContent?.includes('Overridden');
        });
        const overriddenBudgetRowsCount = await page.locator('tbody tr').count();
        const overriddenText = await page.locator('tbody').innerText();

        // Tab 3: Budget Utilization
        await page.click('button.tab-pill:has-text("Budget Utilization")');
        await page.waitForSelector('.scope-card');
        const scopeCardsCount = await page.locator('.scope-card').count();

        // Return to Tab 4: Active & Paused Runs -> Open Approve & Resume modal -> Resume -> Pause active run
        await page.click('button.tab-pill:has-text("Active & Paused Runs")');
        await page.waitForSelector(`tbody tr:has-text("${RUN_ID_PAUSED}")`);

        // Open Approve & Resume modal and capture screenshot
        await page.click(`tbody tr:has-text("${RUN_ID_PAUSED}") button:has-text("Approve & Resume")`);
        await page.waitForSelector('.modal-card');
        await page.fill('#ext-cost', '10');
        await page.fill('#ext-notes', 'Approved via real Angular Playwright E2E');
        await page.screenshot({ path: resolve(__dirname, 'admin-limits-resume-modal.png'), fullPage: true });

        // Submit Approve & Resume -> live BaseRemotableOperation round-trip
        await page.click('.modal-card button:has-text("Approve & Resume Run")');
        await page.waitForSelector('[data-testid="admin-limits-success-banner"]');
        const resumeSuccessBanner = await page.locator('[data-testid="admin-limits-success-banner"]').innerText();

        // Pause the active run -> live BaseRemotableOperation round-trip
        await page.click(`tbody tr:has-text("${RUN_ID_ACTIVE}") button:has-text("Pause")`);
        await page.waitForFunction(
            (runId) => {
                const rows = Array.from(document.querySelectorAll('tbody tr'));
                const row = rows.find((r) => r.textContent?.includes(runId));
                return Boolean(row && row.textContent?.includes('Paused'));
            },
            RUN_ID_ACTIVE,
        );
        const pauseSuccessBanner = await page.locator('[data-testid="admin-limits-success-banner"]').innerText();

        const rawMarkdownLeaks = await page.evaluate(() => {
            const text = document.body.innerText;
            return /(^|\n)\s*#{1,6}\s+|\*\*[^*]+\*\*|```/.test(text);
        });

        if (pageErrors.length > 0 || consoleErrors.length > 0) {
            throw new Error(`Browser errors detected: pageErrors=${JSON.stringify(pageErrors)}, consoleErrors=${JSON.stringify(consoleErrors)}`);
        }

        const report = {
            verifiedAtISO: new Date().toISOString(),
            gitRevision: {
                branch: gitBranch,
                headSha: gitHeadSha,
                componentSource: 'packages/Angular/Explorer/dashboards/src/AdminLimits/admin-limits-resource.component.ts',
                serverOperationsSource: 'packages/AI/Agents/src/operations/LimitsOperations.ts',
            },
            renderedMode: 'Real Angular AdminLimitsResourceComponent + ExplorerAdminShell via Vite',
            chromiumVersion: browser.version(),
            baseUrl,
            pageErrorsCount: pageErrors.length,
            consoleErrorsCount: consoleErrors.length,
            brokenImagesCount: overviewStats.brokenImages,
            rawMarkdownLeaks,
            computedTokens: {
                bodyBg: overviewStats.bodyBg,
                brandPrimary: overviewStats.brandPrimary,
            },
            assertions: {
                explorerDefaultNavItemsCount: navCount,
                shellRouteBadge: shellRouteBadge.trim(),
                realComponentMounted: overviewStats.componentMounted,
                tierCardsRendered: overviewStats.tierCards,
                backstopCardsRendered: overviewStats.backstopCards,
                clampedBudgetRowsFiltered: overriddenBudgetRowsCount,
                overriddenBudgetContainsUserPolicyTier: overriddenText.includes('UserAgentPolicy'),
                drawerContainsClampedPolicy: drawerText.includes('Clamped'),
                budgetScopeCardsRendered: scopeCardsCount,
                drawerContainsFastJudgeVerdict: drawerText.includes('Oscillating without writing new records'),
                resumeSuccessBanner,
                pauseSuccessBanner,
            },
            screenshots: [
                'admin-limits-overview.png',
                'admin-limits-runs-drawer.png',
                'admin-limits-resume-modal.png',
            ],
        };
        writeFileSync(
            resolve(__dirname, 'admin-limits-verification-report.json'),
            JSON.stringify(report, null, 2) + '\n',
            'utf8',
        );
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await browser.close();
        await vite.close();
        await new Promise((resolveClose) => server.close(resolveClose));
        rmSync(harnessDir, { recursive: true, force: true });
        cleanup();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
