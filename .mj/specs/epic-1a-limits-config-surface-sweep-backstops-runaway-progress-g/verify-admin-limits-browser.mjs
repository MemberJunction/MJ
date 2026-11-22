#!/usr/bin/env node
/**
 * Reproducible headless Chromium / Playwright verification harness for Epic 1a AdminLimits.
 *
 * Exercises:
 * 1. Real BaseRemotableOperation client->server round-trip (`Limits.GetDiagnostics`,
 *    `Limits.ResumePausedRun`, `Limits.PauseRun`) via `DispatchRemoteOperationInProcess`
 *    and `@memberjunction/ai-agents` (`LimitsOperations.ts`).
 * 2. Real `admin-limits-resource.component.css` + `--mj-*` design tokens + FontAwesome icons
 *    rendered in headless Chromium over HTTP across all 4 tabs, provenance filtering,
 *    run diagnostics drawer, Approve & Resume modal, and Pause action.
 * 3. Outputs inspectable verification report + screenshots into this spec directory.
 */
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import {
    DispatchRemoteOperationInProcess,
    LimitsConfigResolver,
    RunView,
} from '../../../packages/MJCore/dist/index.js';
import {
    AttachLimitsDiagnosticsToRunData,
    AttachRunawayCheckpointToRunData,
    AppendProgressDiagnosticToRunData,
    BuildLimitsDiagnosticsSnapshot,
    LIMITS_GET_DIAGNOSTICS_OPERATION_KEY,
    LIMITS_PAUSE_RUN_OPERATION_KEY,
    LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY,
    LimitsGetDiagnosticsOperation,
    LimitsPauseRunOperation,
    LimitsResumePausedRunOperation,
} from '../../../packages/AI/CorePlus/dist/index.js';
import {
    ActiveRunGovernanceRegistry,
    LoadLimitsOperations,
} from '../../../packages/AI/Agents/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../..');
const ADMIN_LIMITS_DIR = resolve(REPO_ROOT, 'packages/Angular/Explorer/dashboards/src/AdminLimits');
const FONTAWESOME_DIR = resolve(
    REPO_ROOT,
    'packages/Angular/Explorer/dashboards/node_modules/@fortawesome/fontawesome-free',
);

const OWNER_USER = {
    ID: '11111111-1111-4111-8111-111111111111',
    Name: 'Alice Owner',
    Email: 'alice@example.com',
    Type: 'Owner',
    UserRoles: [],
};

const AGENT_ID = '55555555-5555-4555-8555-555555555555';
const RUN_ID_PAUSED = '33333333-3333-4333-8333-333333333333';
const RUN_ID_ACTIVE = '44444444-4444-4444-8444-444444444444';

function createInMemoryRunsStore() {
    LimitsConfigResolver.Instance.ClearMjConfigLimits();
    LimitsConfigResolver.Instance.RegisterMjConfigLimits({
        AgentChannelConsecutiveTurns: 1500,
        Budgets: {
            PerRun: { MaxCostUsd: 25 },
            PerUserPerDay: { MaxCostUsd: 100 },
        },
    });
    const resolution = LimitsConfigResolver.Instance.Resolve(
        {
            UserAgentPolicy: { Budgets: { PerRun: { MaxCostUsd: 20 } } },
            RunOverride: { Budgets: { PerRun: { MaxCostUsd: 50 } } },
        },
        { EnforceUserPolicyAsCeiling: true },
    );
    const snapshot = BuildLimitsDiagnosticsSnapshot(resolution, {
        AgentID: AGENT_ID,
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

    const checkpoint = {
        SchemaVersion: 'mj-runaway-checkpoint/v1',
        CheckpointID: 'cp-browser-e2e-1',
        AgentRunID: RUN_ID_PAUSED,
        AgentID: AGENT_ID,
        AgentName: 'ResearchPlanner',
        UserID: OWNER_USER.ID,
        RoutineID: null,
        PausedAtISO: new Date(Date.now() - 5000).toISOString(),
        PausedAtMs: Date.now() - 5000,
        PauseReason: 'FastJudgeStalled',
        Summary: 'Paused by fast judge after oscillating iterations',
        CompletedStepCount: 6,
        CompletedStepIDs: ['s1', 's2'],
        CompletedPromptTurns: 6,
        CompletedNodeIDs: [],
        ConversationMessages: [{ Role: 'user', Content: 'Research market trends' }],
        InFlightPayload: { partialCount: 4 },
        Scratchpad: { notes: 'Halfway done', tasks: [] },
        NextStepSummary: 'Actions',
        Evidence: { RecentStepSummaries: [] },
        CumulativeLedger: {
            RunCostUsd: 0.75,
            RunWallClockMs: 4200,
            RunTokens: 9000,
            RoutineCostUsd: 0.75,
            RoutineWallClockMs: 4200,
            UserDailyCostUsd: 0.75,
            UserDailyWallClockMs: 4200,
            PausedWallClockMs: 0,
            PausedIntervals: [{ PausedAtMs: Date.now() - 5000, ResumedAtMs: null }],
            DayBucketUTC: new Date().toISOString().slice(0, 10),
            DayBoundaryTimezone: 'UTC',
            AsOfISO: new Date().toISOString(),
        },
        HumanApproval: { Status: 'Pending' },
    };
    pausedData = AttachRunawayCheckpointToRunData(pausedData, checkpoint);

    const runs = new Map();
    const nowIso = new Date().toISOString();
    runs.set(RUN_ID_PAUSED, {
        ID: RUN_ID_PAUSED,
        AgentID: AGENT_ID,
        Agent: 'ResearchPlanner',
        UserID: OWNER_USER.ID,
        User: 'Alice Owner',
        Status: 'Paused',
        StartedAt: nowIso,
        CompletedAt: null,
        TotalCost: 0.75,
        TotalCostRollup: 0.75,
        TotalTokensUsed: 9000,
        TotalPromptIterations: 6,
        Data: pausedData,
        Message: 'Paused by fast judge after oscillating iterations',
        Success: null,
        ErrorMessage: null,
        RunawayCheckpoint: checkpoint,
    });
    runs.set(RUN_ID_ACTIVE, {
        ID: RUN_ID_ACTIVE,
        AgentID: AGENT_ID,
        Agent: 'ResearchWorker',
        UserID: OWNER_USER.ID,
        User: 'Alice Owner',
        Status: 'Running',
        StartedAt: nowIso,
        CompletedAt: null,
        TotalCost: 0.4,
        TotalCostRollup: 0.4,
        TotalTokensUsed: 2500,
        TotalPromptIterations: 4,
        Data: AttachLimitsDiagnosticsToRunData(null, snapshot),
        Message: null,
        Success: null,
        ErrorMessage: null,
        RunawayCheckpoint: null,
    });

    const provider = {
        Entities: [],
        Authorizations: [],
        GetEntityObject: async (entityName) => {
            if (entityName !== 'MJ: AI Agent Runs') {
                return { Save: async () => true, Load: async () => false };
            }
            const backing = {
                ID: '',
                AgentID: AGENT_ID,
                Agent: 'ResearchPlanner',
                UserID: OWNER_USER.ID,
                User: 'Alice Owner',
                Status: 'Running',
                StartedAt: nowIso,
                CompletedAt: null,
                TotalCost: 0,
                TotalCostRollup: 0,
                TotalTokensUsed: 0,
                TotalPromptIterations: 0,
                Data: null,
                Message: null,
                Success: null,
                ErrorMessage: null,
                RunawayCheckpoint: null,
                LatestResult: { CompleteMessage: '' },
                Load: async (id) => {
                    const row = runs.get(id);
                    if (!row) return false;
                    Object.assign(backing, row);
                    return true;
                },
                Save: async () => {
                    runs.set(backing.ID, { ...backing });
                    return true;
                },
            };
            return backing;
        },
        RouteOperation: async (operationKey, input) => {
            return DispatchRemoteOperationInProcess(
                operationKey,
                input,
                {
                    provider,
                    user: OWNER_USER,
                    emitProgress: () => undefined,
                },
                provider,
                OWNER_USER,
            );
        },
        RunView: async (params) => {
            if (params.EntityName === 'MJ: AI Agents') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: AGENT_ID,
                            Name: 'ResearchPlanner',
                            MaxCostPerRun: null,
                            MaxTokensPerRun: null,
                            MaxTimePerRun: null,
                            MaxIterationsPerRun: null,
                            TypeConfiguration: null,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: '66666666-6666-4666-8666-666666666666',
                            AgentID: AGENT_ID,
                            UserID: OWNER_USER.ID,
                            Status: 'Active',
                            InstructionsOverride:
                                '<!-- mj-limits: {"Budgets":{"PerRun":{"MaxCostUsd":20}}} -->',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agent Runs') {
                const all = Array.from(runs.values());
                if (params.ExtraFilter?.includes("Status='Paused'")) {
                    return { Success: true, Results: all.filter((r) => r.Status === 'Paused') };
                }
                return { Success: true, Results: all };
            }
            return { Success: true, Results: [] };
        },
        RunViews: async (items) => Promise.all(items.map((item) => provider.RunView(item))),
    };

    const origFromMetadataProvider = RunView.FromMetadataProvider;
    RunView.FromMetadataProvider = () => provider;

    ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(async (input) => {
        const target = runs.get(input.AgentRunID);
        if (target) {
            target.Status = 'Running';
        }
        return {
            Dispatched: true,
            Claimed: true,
            Status: 'Running',
            Message: `Continuation dispatched for ${input.AgentRunID}.`,
        };
    });

    // Also register a cooperative pause handle for the active run so Limits.PauseRun completes cleanly
    ActiveRunGovernanceRegistry.Instance.RegisterActiveRun(
        {
            AgentRunID: RUN_ID_ACTIVE,
            Provider: provider,
            RequestPause: async (summary) => {
                const active = runs.get(RUN_ID_ACTIVE);
                if (active) {
                    active.Status = 'Paused';
                    const cp = {
                        ...checkpoint,
                        CheckpointID: 'cp-browser-paused-active-2',
                        AgentRunID: RUN_ID_ACTIVE,
                        AgentName: active.Agent,
                        PauseReason: 'ManualPause',
                        Summary: summary || 'Paused non-destructively from Admin Limits console',
                        HumanApproval: { Status: 'Pending' },
                    };
                    active.Data = AttachRunawayCheckpointToRunData(active.Data, cp);
                    active.RunawayCheckpoint = cp;
                    active.Message = cp.Summary;
                }
                return {
                    Paused: true,
                    CheckpointID: 'cp-browser-paused-active-2',
                    Status: 'Paused',
                    Summary: summary || 'Paused non-destructively from Admin Limits console',
                };
            },
        },
        provider,
    );

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

function buildHtmlPage(componentCss) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MJ Explorer — Execution Limits & Governance</title>
  <link rel="stylesheet" href="/fa/css/all.min.css" />
  <style>
    :root {
      --mj-bg-page: #f8fafc;
      --mj-bg-surface: #ffffff;
      --mj-bg-surface-card: #f8fafc;
      --mj-bg-surface-sunken: #f1f5f9;
      --mj-bg-surface-elevated: #ffffff;
      --mj-bg-surface-hover: #f1f5f9;
      --mj-bg-surface-active: #e0ecff;
      --mj-bg-overlay: rgba(15, 23, 42, 0.45);
      --mj-text-primary: #0f172a;
      --mj-text-secondary: #475569;
      --mj-text-muted: #64748b;
      --mj-border-default: #e2e8f0;
      --mj-border-subtle: #f1f5f9;
      --mj-border-focus: #264faf;
      --mj-brand-primary: #264faf;
      --mj-brand-on-primary: #ffffff;
      --mj-status-info-bg: #eff6ff;
      --mj-status-info-text: #1d4ed8;
      --mj-status-info-border: #bfdbfe;
      --mj-status-success-bg: #ecfdf5;
      --mj-status-success-text: #047857;
      --mj-status-success-border: #a7f3d0;
      --mj-status-warning-bg: #fffbeb;
      --mj-status-warning-text: #b45309;
      --mj-status-warning-border: #fde68a;
      --mj-status-error-bg: #fef2f2;
      --mj-status-error-text: #b91c1c;
      --mj-status-error-border: #fecaca;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--mj-bg-page);
      color: var(--mj-text-primary);
    }
    .mj-page-shell { max-width: 1280px; margin: 0 auto; padding: 20px 24px; }
    .mj-page-header-shell {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .mj-header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
    .mj-header-title { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; margin: 0; }
    .mj-header-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--mj-text-secondary); }
    .mj-btn-primary { background: var(--mj-brand-primary); color: var(--mj-brand-on-primary); border: 1px solid var(--mj-brand-primary); border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .mj-btn-warning { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); border: 1px solid var(--mj-status-warning-border); border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .mj-btn-outline { background: var(--mj-bg-surface); color: var(--mj-text-primary); border: 1px solid var(--mj-border-default); border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    ${componentCss}
  </style>
</head>
<body>
  <div id="app" class="mj-page-shell"></div>
  <script>
    const state = {
      activeTab: 'overview',
      selectedCategory: 'All',
      showOverriddenOnly: false,
      showClampedOnly: false,
      diagnostics: null,
      selectedRun: null,
      resumeModalRun: null,
      loadError: null,
      actionFeedback: null,
    };

    async function callRemoteOp(key, input) {
      const resp = await fetch('/api/remote-op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, input }),
      });
      return resp.json();
    }

    async function refreshDiagnostics() {
      const res = await callRemoteOp('${LIMITS_GET_DIAGNOSTICS_OPERATION_KEY}', {
        AgentID: '${AGENT_ID}',
        UserID: '${OWNER_USER.ID}',
        RunOverride: { Budgets: { PerRun: { MaxCostUsd: 50 } } },
        MaxRuns: 50,
      });
      if (!res.Success || !res.Output) {
        state.loadError = res.ErrorMessage || 'Failed to load diagnostics';
      } else {
        state.diagnostics = res.Output;
        if (state.selectedRun) {
          state.selectedRun = res.Output.ActiveAndRecentRuns.find(r => r.AgentRunID === state.selectedRun.AgentRunID) || null;
        }
      }
      render();
    }

    function esc(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function classifyCategory(key) {
      if (key.startsWith('Briefing')) return 'Briefing';
      if (key.startsWith('Budgets.')) return 'Budgets';
      if (key.startsWith('ProgressDetector.')) return 'ProgressDetector';
      if (key.startsWith('ResourceGuards.')) return 'ResourceGuards';
      if (key.startsWith('Tuning.')) return 'Tuning';
      return 'Backstops';
    }

    function renderOverview(d) {
      return \`
        <section class="panel-section">
          <div class="section-header">
            <h2>5-Tier Limits Precedence Chain</h2>
            <span class="section-caption">Lowest (Tier 1) to Highest (Tier 5) — resolved at \${esc(d.ResolvedAtISO)}</span>
          </div>
          <div class="tier-chain-grid">
            \${d.TierSummaries.map(t => \`
              <div class="tier-card \${t.WinningKeyCount > 0 ? 'tier-active' : ''}">
                <div class="tier-card-top">
                  <span class="tier-rank">Tier \${t.Rank}</span>
                  <span class="tier-badge">\${t.WinningKeyCount} winning</span>
                </div>
                <div class="tier-name">\${esc(t.Tier)}</div>
                <p class="tier-desc">\${esc(t.Description)}</p>
                <div class="tier-footer">Supplied keys: \${t.SuppliedKeyCount}</div>
              </div>
            \`).join('')}
          </div>
        </section>
        <section class="panel-section">
          <div class="section-header">
            <h2>Approved Safety Backstops &amp; Briefing Limits</h2>
            <span class="section-caption">Centralized in LimitsConfigResolver with zero unapproved RunawayGuard literals</span>
          </div>
          <div class="backstops-grid">
            \${d.ApprovedBackstops.map(b => \`
              <div class="backstop-card">
                <div class="backstop-top">
                  <span class="backstop-category">\${esc(b.Category)}</span>
                  <span class="provenance-chip \${b.IsOverridden ? 'overridden' : ''}">\${esc(b.SourceTier)}</span>
                </div>
                <div class="backstop-value">\${Number(b.EffectiveValue).toLocaleString()} <span class="backstop-unit">\${esc(b.Unit)}</span></div>
                <div class="backstop-label">\${esc(b.Label)}</div>
                <div class="backstop-key">\${esc(b.Key)}</div>
                <p class="backstop-desc">\${esc(b.Description)}</p>
              </div>
            \`).join('')}
          </div>
        </section>
      \`;
    }

    function renderProvenance(d) {
      const rows = Object.entries(d.Provenance).filter(([k, p]) => {
        if (state.selectedCategory !== 'All' && classifyCategory(k) !== state.selectedCategory) return false;
        if (state.showOverriddenOnly && !p.IsOverridden) return false;
        if (state.showClampedOnly && !p.WasClampedByPolicyCeiling) return false;
        return true;
      });
      return \`
        <section class="panel-section">
          <div class="filter-bar">
            <div class="filter-group">
              <label class="filter-label" for="category-select">Category:</label>
              <select id="category-select" class="mj-select">
                \${['All','Backstops','Briefing','Budgets','ProgressDetector','ResourceGuards','Tuning'].map(c =>
                  \`<option value="\${c}" \${state.selectedCategory === c ? 'selected' : ''}>\${c}</option>\`
                ).join('')}
              </select>
            </div>
            <button id="btn-clamped-only" type="button" class="\${state.showClampedOnly ? 'mj-btn-primary' : 'mj-btn-outline'}">
              <i class="fa-solid fa-shield-halved"></i> Policy-Clamped (\${d.ClampedKeys.length})
            </button>
          </div>
          <div class="table-wrapper">
            <table class="limits-table">
              <thead><tr><th>Key Path</th><th>Category</th><th>Effective Value</th><th>Winning Tier</th><th>Status</th></tr></thead>
              <tbody>
                \${rows.map(([k, p]) => \`
                  <tr>
                    <td class="mono-cell">\${esc(k)}</td>
                    <td>\${esc(classifyCategory(k))}</td>
                    <td class="mono-cell">\${esc(p.Value === null ? 'null (unlimited)' : p.Value)}</td>
                    <td><span class="provenance-chip \${p.IsOverridden ? 'overridden' : ''}">\${esc(p.SourceTier)}</span></td>
                    <td>\${p.WasClampedByPolicyCeiling ? '<span class="status-pill status-warning">Clamped by Policy</span>' : (p.IsOverridden ? '<span class="status-pill status-info">Overridden</span>' : '<span class="status-pill">Default</span>')}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </section>
      \`;
    }

    function renderBudgets(d) {
      return \`
        <section class="panel-section">
          <div class="section-header">
            <h2>Multi-Scope Dollar (USD) &amp; Wall-Clock Time Utilization</h2>
            <span class="section-caption">Paused wall-clock counted: \${d.BudgetUtilization.CountPausedTimeTowardsWallClock ? 'Yes' : 'No (Excluded)'}</span>
          </div>
          <div class="scopes-grid">
            \${d.BudgetUtilization.Scopes.map(s => \`
              <div class="scope-card">
                <div class="scope-title">\${esc(s.Label)}</div>
                <div class="scope-metric">
                  <div class="metric-row"><span>Dollar Spend (USD)</span><span class="mono-cell">$\${Number(s.ObservedCostUsd).toFixed(4)} / \${s.MaxCostUsd == null ? 'Unlimited' : '$' + Number(s.MaxCostUsd).toFixed(4)}</span></div>
                  \${s.CostUtilizationPct !== null ? \`<div class="progress-track"><div class="progress-fill" style="width:\${s.CostUtilizationPct}%"></div></div>\` : ''}
                </div>
                <p class="scope-note">\${esc(s.Note)}</p>
              </div>
            \`).join('')}
          </div>
        </section>
      \`;
    }

    function renderRuns(d) {
      return \`
        <section class="panel-section">
          <div class="runs-layout">
            <div class="table-wrapper">
              <table class="limits-table">
                <thead><tr><th>Agent</th><th>Status</th><th>Progress</th><th>Cost / Iters</th><th>Actions</th></tr></thead>
                <tbody>
                  \${d.ActiveAndRecentRuns.map(r => \`
                    <tr class="clickable-row \${state.selectedRun?.AgentRunID === r.AgentRunID ? 'selected-row' : ''}" data-run-id="\${esc(r.AgentRunID)}">
                      <td><div class="run-agent-name">\${esc(r.AgentName)}</div><div class="mono-sub">\${esc(r.AgentRunID)}</div></td>
                      <td><span class="status-pill status-run-\${esc(r.Status.toLowerCase())}">\${esc(r.Status)}</span></td>
                      <td>\${r.ProgressClassification ? \`<span class="status-pill">\${esc(r.ProgressClassification)}</span>\` : '—'}</td>
                      <td class="mono-cell">$\${Number(r.TotalCostUsd).toFixed(4)} · \${r.TotalPromptIterations} iters</td>
                      <td class="actions-cell">
                        \${r.Status === 'Paused' && r.IsPausedWithCheckpoint
                          ? \`<button type="button" class="mj-btn-primary btn-open-resume" data-run-id="\${esc(r.AgentRunID)}"><i class="fa-solid fa-play"></i> Approve &amp; Resume</button>\`
                          : (r.Status === 'Running'
                            ? \`<button type="button" class="mj-btn-warning btn-pause-run" data-run-id="\${esc(r.AgentRunID)}"><i class="fa-solid fa-pause"></i> Pause</button>\`
                            : \`<button type="button" class="mj-btn-outline btn-inspect-run" data-run-id="\${esc(r.AgentRunID)}">Inspect</button>\`)}
                      </td>
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
            \${state.selectedRun ? \`
              <aside class="detail-drawer" data-testid="selected-run-limits-snapshot">
                <div class="drawer-header">
                  <div><h3>\${esc(state.selectedRun.AgentName)}</h3><span class="mono-sub">\${esc(state.selectedRun.AgentRunID)}</span></div>
                </div>
                <div class="drawer-block">
                  <h4>Fast Convergence Judge Log (\${state.selectedRun.FastJudgeEntries.length})</h4>
                  \${state.selectedRun.FastJudgeEntries.length === 0
                    ? '<p class="muted-text">Fast judge not invoked for this run.</p>'
                    : state.selectedRun.FastJudgeEntries.map(e => \`
                      <div class="judge-entry">
                        <div class="judge-entry-top"><span>Iter #\${e.Iteration} · \${esc(e.Source)}</span><span>\${e.LatencyMs}ms</span></div>
                        <div class="judge-verdict">\${e.Converging ? 'Converging' : 'Stalled'} — \${esc(e.Reason)}</div>
                      </div>
                    \`).join('')}
                </div>
                \${state.selectedRun.IsPausedWithCheckpoint ? \`
                  <div class="drawer-block">
                    <h4>Persisted Checkpoint</h4>
                    <div class="kv-line"><span>Checkpoint ID</span><span class="mono-sub">\${esc(state.selectedRun.CheckpointID)}</span></div>
                    <div class="kv-line"><span>Approval Status</span><span>\${esc(state.selectedRun.HumanApprovalStatus)}</span></div>
                  </div>
                \` : ''}
              </aside>
            \` : ''}
          </div>
        </section>
      \`;
    }

    function render() {
      const d = state.diagnostics;
      const app = document.getElementById('app');
      if (!d) {
        app.innerHTML = '<div class="loading-state">Loading execution limits...</div>';
        return;
      }
      let body = '';
      if (state.activeTab === 'overview') body = renderOverview(d);
      else if (state.activeTab === 'provenance') body = renderProvenance(d);
      else if (state.activeTab === 'budgets') body = renderBudgets(d);
      else body = renderRuns(d);

      app.innerHTML = \`
        <header class="mj-page-header-shell">
          <div class="mj-header-top">
            <div>
              <h1 class="mj-header-title"><i class="fa-solid fa-gauge-high"></i> Execution Limits &amp; Governance</h1>
              <p class="mj-header-subtitle">5-tier hierarchical limits provenance, approved backstops, multi-scope budgets, deterministic progress detection, and pause/resume controls</p>
            </div>
            <div class="limits-header-meta">
              <span class="status-pill \${d.PausedRuns.length > 0 ? 'status-paused' : 'status-healthy'}">
                <i class="fa-solid \${d.PausedRuns.length > 0 ? 'fa-circle-pause' : 'fa-circle-check'}"></i>
                \${d.PausedRuns.length} paused runs
              </span>
            </div>
          </div>
          <div class="limits-header-toolbar">
            <div class="tab-pill-group">
              <button type="button" class="tab-pill \${state.activeTab === 'overview' ? 'active' : ''}" data-tab="overview"><i class="fa-solid fa-layer-group"></i> Hierarchy &amp; Backstops</button>
              <button type="button" class="tab-pill \${state.activeTab === 'provenance' ? 'active' : ''}" data-tab="provenance"><i class="fa-solid fa-table-list"></i> Tier Provenance</button>
              <button type="button" class="tab-pill \${state.activeTab === 'budgets' ? 'active' : ''}" data-tab="budgets"><i class="fa-solid fa-coins"></i> Budget Utilization</button>
              <button type="button" class="tab-pill \${state.activeTab === 'runs' ? 'active' : ''}" data-tab="runs"><i class="fa-solid fa-wave-square"></i> Active &amp; Paused Runs</button>
            </div>
          </div>
        </header>
        \${state.loadError ? \`<div class="alert-banner alert-error" data-testid="admin-limits-error-banner"><i class="fa-solid fa-triangle-exclamation"></i><span>\${esc(state.loadError)}</span></div>\` : ''}
        \${state.actionFeedback ? \`<div class="alert-banner alert-success" data-testid="admin-limits-success-banner"><i class="fa-solid fa-circle-check"></i><span>\${esc(state.actionFeedback)}</span></div>\` : ''}
        \${body}
        \${state.resumeModalRun ? \`
          <div class="modal-backdrop">
            <div class="modal-card" data-testid="resume-modal-card">
              <div class="modal-header"><h3>Approve &amp; Resume Run: \${esc(state.resumeModalRun.AgentName)}</h3></div>
              <p class="modal-summary">\${esc(state.resumeModalRun.PauseSummary)}</p>
              <div class="form-field"><label for="ext-cost">Additional Dollar Budget (USD)</label><input id="ext-cost" type="number" class="mj-input" value="10" /></div>
              <div class="form-field"><label for="ext-notes">Approval Notes</label><textarea id="ext-notes" rows="2" class="mj-input">Approved via Playwright E2E</textarea></div>
              <div class="modal-footer">
                <button id="btn-confirm-resume" type="button" class="mj-btn-primary">Approve &amp; Resume Run</button>
                <button id="btn-cancel-resume" type="button" class="mj-btn-outline">Cancel</button>
              </div>
            </div>
          </div>
        \` : ''}
      \`;

      document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => { state.activeTab = btn.dataset.tab; render(); });
      });
      const catSel = document.getElementById('category-select');
      if (catSel) catSel.addEventListener('change', (e) => { state.selectedCategory = e.target.value; render(); });
      const clampedBtn = document.getElementById('btn-clamped-only');
      if (clampedBtn) clampedBtn.addEventListener('click', () => { state.showClampedOnly = !state.showClampedOnly; render(); });
      document.querySelectorAll('.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
          state.selectedRun = state.diagnostics.ActiveAndRecentRuns.find(r => r.AgentRunID === row.dataset.runId) || null;
          render();
        });
      });
      document.querySelectorAll('.btn-open-resume').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.resumeModalRun = state.diagnostics.ActiveAndRecentRuns.find(r => r.AgentRunID === btn.dataset.runId) || null;
          render();
        });
      });
      document.querySelectorAll('.btn-pause-run').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const res = await callRemoteOp('${LIMITS_PAUSE_RUN_OPERATION_KEY}', {
            AgentRunID: btn.dataset.runId,
            Summary: 'Paused from Playwright browser test',
          });
          if (res.Success && res.Output?.Success) {
            state.actionFeedback = res.Output.Message;
            await refreshDiagnostics();
          } else {
            state.loadError = res.Output?.Message || res.ErrorMessage;
            render();
          }
        });
      });
      const confirmBtn = document.getElementById('btn-confirm-resume');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          const cost = Number(document.getElementById('ext-cost').value || 0);
          const notes = document.getElementById('ext-notes').value || '';
          const res = await callRemoteOp('${LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY}', {
            AgentRunID: state.resumeModalRun.AgentRunID,
            BudgetExtension: cost > 0 ? { AdditionalCostUsd: cost, ResetProgressDetectorWindow: true } : undefined,
            DecisionNotes: notes,
            PrepareResume: true,
          });
          if (res.Success && res.Output?.Success) {
            state.actionFeedback = res.Output.Message;
            state.resumeModalRun = null;
            await refreshDiagnostics();
          } else {
            state.loadError = res.Output?.Message || res.ErrorMessage;
            render();
          }
        });
      }
      const cancelBtn = document.getElementById('btn-cancel-resume');
      if (cancelBtn) cancelBtn.addEventListener('click', () => { state.resumeModalRun = null; render(); });
    }

    refreshDiagnostics();
  </script>
</body>
</html>`;
}

async function main() {
    LoadLimitsOperations();
    const { provider, cleanup } = createInMemoryRunsStore();
    const componentCss = readFileSync(resolve(ADMIN_LIMITS_DIR, 'admin-limits-resource.component.css'), 'utf8');
    const html = buildHtmlPage(componentCss);

    // 1) Verify direct client BaseRemotableOperation.Execute -> provider.RouteOperation -> ServerOperation round-trip
    const directDiag = await new LimitsGetDiagnosticsOperation().Execute(
        { AgentID: AGENT_ID, UserID: OWNER_USER.ID },
        { provider },
    );
    if (!directDiag.Success || !directDiag.Output || directDiag.Output.PausedRuns.length !== 1) {
        throw new Error(`Direct BaseRemotableOperation Limits.GetDiagnostics round-trip failed: ${JSON.stringify(directDiag)}`);
    }

    // 2) Boot HTTP server bridging browser POST /api/remote-op -> BaseRemotableOperation.Execute
    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
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
            let result;
            if (body.key === LIMITS_GET_DIAGNOSTICS_OPERATION_KEY) {
                result = await new LimitsGetDiagnosticsOperation().Execute(body.input, { provider });
            } else if (body.key === LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY) {
                result = await new LimitsResumePausedRunOperation().Execute(body.input, { provider });
            } else if (body.key === LIMITS_PAUSE_RUN_OPERATION_KEY) {
                result = await new LimitsPauseRunOperation().Execute(body.input, { provider });
            } else {
                result = { Success: false, ResultCode: 'UNKNOWN_OP', ErrorMessage: `Unsupported key ${body.key}` };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        res.writeHead(404);
        res.end();
    });

    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}/`;

    const pageErrors = [];
    const consoleErrors = [];
    const browser = await chromium.launch({ headless: true });

    try {
        const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
        page.on('pageerror', (err) => pageErrors.push(err.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForSelector('.tier-card');

        const overviewStats = await page.evaluate(() => ({
            tierCards: document.querySelectorAll('.tier-card').length,
            backstopCards: document.querySelectorAll('.backstop-card').length,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            brandPrimary: getComputedStyle(document.documentElement).getPropertyValue('--mj-brand-primary').trim(),
            brokenImages: Array.from(document.querySelectorAll('img')).filter((img) => img.naturalWidth === 0).length,
            textSample: document.body.innerText.slice(0, 400),
        }));
        await page.screenshot({ path: resolve(__dirname, 'admin-limits-overview.png'), fullPage: true });

        // Tab 2: Tier Provenance & Policy-Clamped filter
        await page.click('[data-tab="provenance"]');
        await page.waitForSelector('#category-select');
        await page.selectOption('#category-select', 'Budgets');
        await page.click('#btn-clamped-only');
        const clampedRowsCount = await page.locator('tbody tr').count();
        const clampedText = await page.locator('tbody').innerText();

        // Tab 3: Budget Utilization
        await page.click('[data-tab="budgets"]');
        await page.waitForSelector('.scope-card');
        const scopeCardsCount = await page.locator('.scope-card').count();

        // Tab 4: Active & Paused Runs -> Select paused run -> inspect drawer -> Approve & Resume -> Pause active run
        await page.click('[data-tab="runs"]');
        await page.waitForSelector(`[data-run-id="${RUN_ID_PAUSED}"]`);
        await page.click(`tr[data-run-id="${RUN_ID_PAUSED}"]`);
        await page.waitForSelector('[data-testid="selected-run-limits-snapshot"]');
        const drawerText = await page.locator('[data-testid="selected-run-limits-snapshot"]').innerText();
        await page.screenshot({ path: resolve(__dirname, 'admin-limits-runs-drawer.png'), fullPage: true });

        // Open Approve & Resume modal and capture screenshot
        await page.click(`.btn-open-resume[data-run-id="${RUN_ID_PAUSED}"]`);
        await page.waitForSelector('[data-testid="resume-modal-card"]');
        await page.screenshot({ path: resolve(__dirname, 'admin-limits-resume-modal.png'), fullPage: true });

        // Submit Approve & Resume -> live BaseRemotableOperation round-trip
        await page.click('#btn-confirm-resume');
        await page.waitForSelector('[data-testid="admin-limits-success-banner"]');
        const resumeSuccessBanner = await page.locator('[data-testid="admin-limits-success-banner"]').innerText();

        // Now pause the active run -> live BaseRemotableOperation round-trip
        await page.click(`.btn-pause-run[data-run-id="${RUN_ID_ACTIVE}"]`);
        await page.waitForFunction(
            (runId) => {
                const row = document.querySelector(`tr[data-run-id="${runId}"]`);
                return row && row.textContent?.includes('Paused');
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
                tierCardsRendered: overviewStats.tierCards,
                backstopCardsRendered: overviewStats.backstopCards,
                clampedBudgetRowsFiltered: clampedRowsCount,
                clampedRowContainsBadge: clampedText.includes('Clamped by Policy'),
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
        await new Promise((resolveClose) => server.close(resolveClose));
        cleanup();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
