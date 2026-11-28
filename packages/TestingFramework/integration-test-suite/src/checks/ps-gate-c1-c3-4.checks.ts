/**
 * Gate G4.8 "C1 → C3.4" (owner PR 5, phase 4): a stopped sidecar ends the work it was doing `Failed` within the declared
 * timeout (`MLSidecar.DefaultRequestTimeoutMs`, 300 s, when the protocol declares none), and the CLI exits non-zero on
 * a failed result (§5.1.7). Server transport: the build half runs the agent in this process as the D5-46 person, who
 * approves the presented plan as their own client save (G4.1's mechanics); the agent-turn half and the success
 * measurement run `mj ai agents run` as a child process.
 *
 * "Stopping the sidecar" is killing the truth sidecar's Python process (SIGKILL, found by the port it listens on); the
 * truth sidecar's wrapper is then restarted on the same URL (`HarnessSidecar.Restart`), so later gates find it up.
 *  1. **During a training run:** a W1-signal plan is presented and approved; once the approved build's training run is
 *     `Running`, the sidecar is killed → the training run is `Failed`, and the agent turn that ran the build (the run the
 *     approval resumed) is `Failed`, each within the timeout of the kill. The CLI cannot run this half (D5-A6-3): a
 *     build starts only from a person's structured approval of the presented plan (D-090), answered on the plan card
 *     and run in the run that answer resumes, while `mj ai agents run` (`run.ts`) takes one prompt and no payload or
 *     `lastRunId` — so no CLI process can ever reach an approved build. The resumed run's `Failed` status is the failed
 *     result the CLI's exit code reads (`run.ts`: `if (!result.success) exitCode = 1`).
 *  2. **During an agent turn:** `mj ai agents run` on the renewal request for the W1-signal world; once its run row exists, the sidecar is
 *     killed → the turn (its profile reads the sidecar) is `Failed` within the timeout and the CLI exits non-zero. A
 *     run that never ran its profile Action (no sidecar call) is recorded and run again, never counted (at most 3 attempts).
 *  3. **After a successful run** (attack 5): the CLI process ends within 10 s of printing its result, with 0 established
 *     connections to the SQL port left (`lsof -nP -a -p <pid> -iTCP:$DB_PORT -sTCP:ESTABLISHED`, sampled until it exits).
 * Needs the database MJAPI uses, the LLM keys, the D5-46 user, the truth sidecar and the truth datasets loaded. Mutation
 * tier: it spends LLM money (one plan run, one build run, up to four CLI runs).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { RunView, ServerOperationScopeManager, WellKnownUserSource, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentRequestEntity, MJAIAgentRunEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { BuildApprovalClaims, BuildApprovalResolver, PROFILE_ACTION_NAME, type PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { HarnessSidecar, TruthSuite, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { Assert, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';

/** A run's status and when it ended. */
export interface EndedRun {
  readonly RunID: string;
  readonly Status: string;
  readonly CompletedAt: Date | null;
}

/** What a CLI child process did: its exit code, when it printed its result, when it ended, and what it printed. */
export interface CliOutcome {
  readonly ExitCode: number | null;
  readonly ResultAt: number | null;
  readonly ExitedAt: number;
  readonly Stdout: string;
  /** The established connections to the SQL port the process held at each sample after its result (last = nearest its exit). */
  readonly SqlConnectionSamples: readonly number[];
}

/** The agent-run steps shared by the A6 gates (G4.8 here, G4.9 in `ps-gate-c1-c3-1`). */
export class PsGateAgentSession {
  /** The orchestrator. */
  public static readonly AGENT = 'Model Development Agent';
  /** The D5-46 person every PR 5 database has. */
  public static readonly PERSON_EMAIL = 'admin@memberjunction.org';
  /** How long a resumed (building) run may take. */
  public static readonly RESUME_TIMEOUT_MS = 20 * 60_000; // 20 min: a W1 build trains on the sidecar
  /** Poll interval while waiting for a run or a request. */
  public static readonly POLL_MS = 250; // 0.25 s: the kill must land while the training run is still Running (a W1 run trains ~23 s)

  /** The person the gate acts as: the D5-46 user (never the MJ system user). */
  public static Person(gate: string): UserInfo {
    const user = UserCache.Instance.Users.find((u) => u.Email?.toLowerCase() === PsGateAgentSession.PERSON_EMAIL);
    if (!user || WellKnownUserSource.Instance.IsSystemUser(user)) throw new Error(`${gate} needs the D5-46 person ${PsGateAgentSession.PERSON_EMAIL} (§2.2): create it before running the gate`);
    return user;
  }

  /** The W1-signal person-year entity the truth datasets test loaded. */
  public static World(provider: IMetadataProvider, gate: string): string {
    const entity = provider.Entities.find((e) => e.SchemaName === 'pstruth' && e.BaseTable === 'W1_MembershipYear');
    if (!entity) throw new Error(`${gate} needs W1-signal loaded: run the truth datasets test first (see the agent gate suite description)`);
    return entity.Name;
  }

  /** A complete plan on `entityName` predicting `target`, with no approval in it. */
  public static Plan(name: string, entityName: string, target: string): PredictiveStudioBuilderPayload {
    const features = [...W_WORLD_FEATURES];
    const plan: ModelingPlanSpec = {
      Name: name,
      Goal: `Predictive Studio truth suite (safe to delete) — predict ${target} on ${entityName}`,
      TargetDefinition: { EntityName: entityName, TargetVariable: target, ProblemType: 'classification', SuccessMetric: 'AUC', AsOfStrategy: { Mode: 'none' } },
      CandidateSources: [{ Kind: 'Entity', Ref: entityName, Why: 'the rows being predicted' }],
      CandidateFeatures: features.map((f) => ({ Name: f, SourceRef: entityName, Kind: 'numeric' as const, Why: 'observable on the row' })),
      LeakageNotes: W_WORLD_DENY_FIELDS.map((f) => ({ Field: f, Risk: 'identifier / world bookkeeping', Action: 'exclude' as const })),
      ProposedExperiments: [{ Label: 'logistic_regression', AlgorithmName: 'logistic_regression', FeatureSet: features, Rationale: 'truth harness', Priority: 1 }],
      ValidationStrategy: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };
    return plan;
  }

  /** The orchestrator agent row. */
  public static async Agent(person: UserInfo, gate: string): Promise<MJAIAgentEntityExtended> {
    await AIEngine.Instance.Config(false, person);
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === PsGateAgentSession.AGENT);
    if (!agent) throw new Error(`${gate}: agent '${PsGateAgentSession.AGENT}' not found`);
    return agent;
  }

  /** One orchestrator run as the person, with `payload` seeded; returns its run ID and the runner's result. */
  public static async Run(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, person: UserInfo, message: string, payload: PredictiveStudioBuilderPayload | undefined, gate: string): Promise<{ readonly RunID: string; readonly Success: boolean }> {
    const result: ExecuteAgentResult<PredictiveStudioBuilderPayload> = await new AgentRunner(ctx.Provider).RunAgent({
      agent, contextUser: person, conversationMessages: [{ role: 'user', content: message }], ...(payload ? { payload } : {}),
    });
    const runId = result.agentRun?.ID;
    if (!runId) throw new Error(`${gate}: the agent run for "${message}" was not created: ${result.errorMessage || 'no error message'}`);
    return { RunID: runId, Success: result.success };
  }

  /** The open Plan request a run raised, as the person loads it. */
  public static async PlanRequest(ctx: IntegrationCheckContext, person: UserInfo, runId: string, gate: string): Promise<MJAIAgentRequestEntity> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentRequestEntity>({
      EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingAgentRunID='${EscapeSQLString(runId)}' AND Status='Requested'`,
      OrderBy: '__mj_CreatedAt DESC', MaxRows: 1, ResultType: 'entity_object', BypassCache: true,
    }, person);
    const request = rows.Success ? rows.Results[0] : undefined;
    if (!request) throw new Error(`${gate}: run ${runId} raised no open plan request (did the control path present the plan?)`);
    return request;
  }

  /** The person approves the request: their own client save (as `RespondToAgentRequest` makes it). */
  public static async Approve(request: MJAIAgentRequestEntity, gate: string): Promise<void> {
    request.Status = 'Approved';
    request.RespondedAt = new Date();
    request.ResponseData = '{"decision":"approve"}';
    const saved = await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => request.Save());
    if (!saved) throw new Error(`${gate}: approving request ${request.ID} failed: ${request.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /** The run an approval resumed, once it exists (it may still be running). */
  public static async ResumedRunId(ctx: IntegrationCheckContext, person: UserInfo, requestId: string, gate: string): Promise<string> {
    const deadline = Date.now() + PsGateAgentSession.RESUME_TIMEOUT_MS;
    for (;;) {
      const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIAgentRequestEntity, 'ResumingAgentRunID'>>({
        EntityName: 'MJ: AI Agent Requests', ExtraFilter: `ID='${EscapeSQLString(requestId)}'`, Fields: ['ResumingAgentRunID'], ResultType: 'simple', BypassCache: true,
      }, person);
      const resumed = rows.Success ? rows.Results[0]?.ResumingAgentRunID : null;
      if (resumed) return resumed;
      if (Date.now() > deadline) throw new Error(`${gate}: request ${requestId} resumed no run in ${PsGateAgentSession.RESUME_TIMEOUT_MS / 60_000} min`);
      await PsGateAgentSession.Sleep(PsGateAgentSession.POLL_MS);
    }
  }

  /** Waits until the run is no longer `Running`, and reads it. */
  public static async Ended(ctx: IntegrationCheckContext, person: UserInfo, runId: string, gate: string): Promise<EndedRun> {
    const deadline = Date.now() + PsGateAgentSession.RESUME_TIMEOUT_MS;
    for (;;) {
      const run = await PsGateAgentSession.ReadRun(ctx, person, runId);
      if (run !== null && run.Status !== 'Running') return run;
      if (Date.now() > deadline) throw new Error(`${gate}: run ${runId} did not end in ${PsGateAgentSession.RESUME_TIMEOUT_MS / 60_000} min`);
      await PsGateAgentSession.Sleep(PsGateAgentSession.POLL_MS);
    }
  }

  /** A run's status and end, or null when it has no row. */
  public static async ReadRun(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<EndedRun | null> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIAgentRunEntity, 'ID' | 'Status' | 'CompletedAt'>>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', 'Status', 'CompletedAt'], ResultType: 'simple', BypassCache: true,
    }, person);
    const row = rows.Success ? rows.Results[0] : undefined;
    return row ? { RunID: row.ID, Status: row.Status, CompletedAt: row.CompletedAt ? new Date(row.CompletedAt) : null } : null;
  }

  /** The milliseconds from `from` to a run's end, or null when it has not ended. */
  public static MsAfter(from: number, run: { readonly CompletedAt: Date | null }): number | null {
    return run.CompletedAt === null ? null : run.CompletedAt.getTime() - from;
  }

  /** Resolves after `ms`. */
  public static Sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

/** The truth sidecar as G4.8 stops it: its URL, its Python listener, the kill and the restart. */
export class PsGateSidecarStop {
  /** The declared timeout when a protocol names none (`MLSidecar.DefaultRequestTimeoutMs`, A6's decision). */
  public static readonly DECLARED_TIMEOUT_MS = 300_000; // 300 s, MLSidecar.DefaultRequestTimeoutMs

  /** The truth sidecar's URL, set as this process's sidecar URL (every sidecar client of this process uses it). */
  public static Url(): string {
    return HarnessSidecar.UseSuiteSidecar();
  }

  /** The pid of the process listening on the sidecar URL's port (the Python service, not its wrapper). */
  public static ListenerPid(url: string): number {
    const port = new URL(url).port;
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim();
    const pid = Number(out.split('\n')[0]);
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`G4.8: no process listens on the sidecar port ${port} (lsof printed "${out}")`);
    return pid;
  }

  /** Kills the sidecar's Python process (SIGKILL) and returns when it happened. */
  public static Kill(url: string): number {
    const pid = PsGateSidecarStop.ListenerPid(url);
    process.kill(pid, 'SIGKILL');
    return Date.now();
  }

  /** Brings the truth sidecar back on the same URL (its wrapper is stopped and started again). */
  public static async Restore(): Promise<void> {
    await HarnessSidecar.Restart();
  }

  /** Restores the sidecar when its health route does not answer (a half that threw after its kill leaves it down). */
  public static async RestoreIfDown(url: string): Promise<void> {
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // connection refused: the sidecar is down
    }
    await PsGateSidecarStop.Restore();
  }
}

/** The `mj ai agents run` child process. */
export class PsGateCli {
  /** How long a CLI run may take before the gate stops it. */
  public static readonly RUN_TIMEOUT_MS = 15 * 60_000; // 15 min: a planning session at M0's 51 s maximum, with room
  /** Interval between samples of the process's SQL connections after its result line. */
  public static readonly SAMPLE_MS = 200; // 0.2 s: the CLI closes its pool within a second of its result

  /** The MJ checkout the TruthSuite package lives in (four levels up: packages/AI/PredictiveStudio/TruthSuite). */
  public static RepoRoot(): string {
    const root = path.resolve(TruthSuite.Root(), '..', '..', '..', '..');
    if (!existsSync(path.join(root, 'packages', 'MJCLI', 'bin', 'run.js'))) throw new Error(`G4.8: ${root} holds no packages/MJCLI/bin/run.js`);
    return root;
  }

  /** The established TCP connections `pid` holds to the SQL port. */
  public static SqlConnections(pid: number): number {
    const port = process.env.DB_PORT || '1433';
    try {
      const out = execFileSync('lsof', ['-nP', '-a', '-p', String(pid), `-iTCP:${port}`, '-sTCP:ESTABLISHED', '-t'], { encoding: 'utf8' }).trim();
      return out.length === 0 ? 0 : out.split('\n').length;
    } catch {
      return 0; // lsof exits 1 when it finds nothing (no connection, or the process is gone)
    }
  }

  /**
   * Runs `mj ai agents run -a <agent> -p <message> --format json` with `env` added, calls `onStart` with the child's pid
   * once it started, and resolves when it exits (or kills it after {@link RUN_TIMEOUT_MS}).
   */
  public static Run(agent: string, message: string, env: NodeJS.ProcessEnv, onStart?: (pid: number) => void): Promise<CliOutcome> {
    const child = spawn(process.execPath, [path.join(PsGateCli.RepoRoot(), 'packages', 'MJCLI', 'bin', 'run.js'), 'ai', 'agents', 'run', '-a', agent, '-p', message, '--format', 'json'], {
      cwd: PsGateCli.RepoRoot(), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (child.pid !== undefined && onStart) onStart(child.pid);
    let stdout = '';
    let resultAt: number | null = null;
    const samples: number[] = [];
    let sampler: NodeJS.Timeout | null = null;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (resultAt === null && stdout.includes('"success"')) {
        resultAt = Date.now();
        const sample = (): void => { if (child.pid !== undefined && child.exitCode === null) samples.push(PsGateCli.SqlConnections(child.pid)); };
        sample(); // one sample as the result is printed, then every SAMPLE_MS until the process exits
        sampler = setInterval(sample, PsGateCli.SAMPLE_MS);
      }
    });
    child.stderr.on('data', () => undefined);
    const killer = setTimeout(() => child.kill('SIGKILL'), PsGateCli.RUN_TIMEOUT_MS);
    return new Promise<CliOutcome>((resolve) => {
      child.once('exit', (code) => {
        clearTimeout(killer);
        if (sampler !== null) clearInterval(sampler);
        resolve({ ExitCode: code, ResultAt: resultAt, ExitedAt: Date.now(), Stdout: stdout, SqlConnectionSamples: samples });
      });
    });
  }
}

/** The gate's halves. */
class PsGateC1C34Steps {
  /**
   * The renewal request on the W1-signal world the other agent gates use (D5-45's wording, naming the world's entity):
   * the agent drafts a unit on its rows and profiles it on the sidecar. (The C1 corpus's unit draft can resolve 0
   * development rows, and a refused draft ends the turn before any sidecar call.)
   */
  public static RenewalMessage(world: string): string {
    return `Predict Renewed for ${world} from the other columns. Use only information available at the end of the membership year.`;
  }
  /** CLI attempts for the agent-turn half: a run that never reached a sidecar call is run again, never counted. */
  public static readonly TURN_ATTEMPTS = 3;
  /** The success measurement's message: a reply with no plan and no sidecar call. */
  public static readonly HELLO_MESSAGE = 'In one sentence, what can you help me with?';
  /** Attack 5's bound: the CLI ends within this long of printing its result. */
  public static readonly EXIT_AFTER_RESULT_MS = 10_000; // 10 s (§5.1.7, F-AG-10)
  /** The `report` row a turn the sidecar stopped writes (`PredictiveStudioModelDevAgent`). */
  public static readonly SIDECAR_STOPPED = 'sidecar-stopped';

  /**
   * The approved build's training run once it is `Running`, polled from `since` straight after the approval (the request
   * names the run it resumed only once that run has ended, so the poll cannot wait for it); it gives up when the request
   * names a resumed run that has ended.
   */
  public static async RunningTraining(ctx: IntegrationCheckContext, person: UserInfo, since: Date, requestId: string): Promise<string> {
    const deadline = Date.now() + PsGateAgentSession.RESUME_TIMEOUT_MS;
    for (;;) {
      const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID'>>({
        EntityName: 'MJ: ML Training Runs', ExtraFilter: `Status='Running' AND StartedAt >= '${since.toISOString()}'`, Fields: ['ID'], OrderBy: 'StartedAt DESC', MaxRows: 1, ResultType: 'simple', BypassCache: true,
      }, person);
      if (!rows.Success) throw new Error(`G4.8: reading the running training runs failed: ${rows.ErrorMessage || 'unknown error'}`);
      if (rows.Results[0]) return rows.Results[0].ID;
      await PsGateC1C34Steps.refuseEndedResume(ctx, person, requestId);
      if (Date.now() > deadline) throw new Error('G4.8: no training run started');
      await PsGateAgentSession.Sleep(PsGateAgentSession.POLL_MS);
    }
  }

  /** Throws when the request names a resumed run that has already ended (its build never had a training run Running). */
  private static async refuseEndedResume(ctx: IntegrationCheckContext, person: UserInfo, requestId: string): Promise<void> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIAgentRequestEntity, 'ResumingAgentRunID'>>({
      EntityName: 'MJ: AI Agent Requests', ExtraFilter: `ID='${EscapeSQLString(requestId)}'`, Fields: ['ResumingAgentRunID'], ResultType: 'simple', BypassCache: true,
    }, person);
    const resumedId = rows.Success ? rows.Results[0]?.ResumingAgentRunID : null;
    const resumed = resumedId ? await PsGateAgentSession.ReadRun(ctx, person, resumedId) : null;
    if (resumed !== null && resumed.Status !== 'Running') throw new Error(`G4.8: the build run ${resumed.RunID} ended ${resumed.Status} before any training run was Running`);
  }

  /** A training run's status and end. */
  public static async Training(ctx: IntegrationCheckContext, person: UserInfo, id: string): Promise<EndedRun> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'Status' | 'CompletedAt'>>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: ['ID', 'Status', 'CompletedAt'], ResultType: 'simple', BypassCache: true,
    }, person);
    const row = rows.Success ? rows.Results[0] : undefined;
    if (!row) throw new Error(`G4.8: training run ${id} could not be read`);
    return { RunID: row.ID, Status: row.Status, CompletedAt: row.CompletedAt ? new Date(row.CompletedAt) : null };
  }

  /** Half 1: the sidecar killed during the approved build's training run. */
  public static async DuringTraining(ctx: IntegrationCheckContext, url: string, agent: MJAIAgentEntityExtended, person: UserInfo, world: string): Promise<Record<string, string | number | boolean | null>> {
    const plan = PsGateAgentSession.Plan(`PSTruth: G4.8 ${new Date().toISOString()} build`, world, 'Renewed');
    const presented = await PsGateAgentSession.Run(ctx, agent, person, 'Show me this plan so I can approve it.', plan, 'G4.8');
    const request = await PsGateAgentSession.PlanRequest(ctx, person, presented.RunID, 'G4.8');
    const since = new Date(Date.now() - 1000);
    await PsGateAgentSession.Approve(request, 'G4.8');
    const trainingId = await PsGateC1C34Steps.RunningTraining(ctx, person, since, request.ID);
    const killedAt = PsGateSidecarStop.Kill(url);
    const resumedId = await PsGateAgentSession.ResumedRunId(ctx, person, request.ID, 'G4.8');
    const resumed = await PsGateAgentSession.Ended(ctx, person, resumedId, 'G4.8');
    const training = await PsGateC1C34Steps.Training(ctx, person, trainingId);
    await PsGateSidecarStop.Restore();
    return {
      trainingRun: trainingId, trainingStatus: training.Status, trainingEndedMsAfterKill: PsGateAgentSession.MsAfter(killedAt, training),
      turn: resumedId, turnStatus: resumed.Status, turnEndedMsAfterKill: PsGateAgentSession.MsAfter(killedAt, resumed),
    };
  }

  /** Half 2: the sidecar killed during a CLI agent turn; attempts that never reached a sidecar call are run again. */
  public static async DuringTurn(ctx: IntegrationCheckContext, url: string, person: UserInfo, world: string): Promise<Record<string, string | number | boolean | null>> {
    const uncounted: string[] = [];
    for (let attempt = 1; attempt <= PsGateC1C34Steps.TURN_ATTEMPTS; attempt++) {
      const since = new Date(Date.now() - 1000);
      let killedAt: number | null = null;
      const cli = PsGateCli.Run(PsGateAgentSession.AGENT, PsGateC1C34Steps.RenewalMessage(world), { PREDICTIVE_STUDIO_SIDECAR_URL: url });
      const runId = await PsGateC1C34Steps.cliRunId(ctx, person, since);
      killedAt = PsGateSidecarStop.Kill(url);
      const outcome = await cli;
      const run = await PsGateAgentSession.Ended(ctx, person, runId, 'G4.8');
      await PsGateSidecarStop.Restore();
      const stoppedRow = await PsGateC1C34Steps.sidecarStoppedRows(ctx, person, runId);
      // Counted when the turn made a sidecar call after the kill (its profile Action ran), whatever the turn did then.
      if (!(await PsGateC1C34Steps.profiled(ctx, person, runId))) { uncounted.push(`${runId}:${run.Status}`); continue; }
      return { attempt, turn: runId, turnStatus: run.Status, turnEndedMsAfterKill: PsGateAgentSession.MsAfter(killedAt, run), cliExit: outcome.ExitCode, sidecarStoppedRows: stoppedRow, uncounted: uncounted.join(',') };
    }
    return { attempt: PsGateC1C34Steps.TURN_ATTEMPTS, turn: null, turnStatus: 'no attempt reached a sidecar call', turnEndedMsAfterKill: null, cliExit: null, sidecarStoppedRows: 0, uncounted: uncounted.join(',') };
  }

  /** Attack 5: a successful CLI run ends within 10 s of its result with no SQL connection left. */
  public static async AfterSuccess(url: string): Promise<Record<string, string | number | boolean | null>> {
    let pid = 0;
    const outcome = await PsGateCli.Run(PsGateAgentSession.AGENT, PsGateC1C34Steps.HELLO_MESSAGE, { PREDICTIVE_STUDIO_SIDECAR_URL: url }, (p) => { pid = p; });
    const lastSample = outcome.SqlConnectionSamples.length > 0 ? outcome.SqlConnectionSamples[outcome.SqlConnectionSamples.length - 1] : 0;
    return {
      cliExit: outcome.ExitCode, printedResult: outcome.ResultAt !== null, exitMsAfterResult: outcome.ResultAt === null ? null : outcome.ExitedAt - outcome.ResultAt,
      sqlConnectionSamples: outcome.SqlConnectionSamples.length, sqlConnectionsAtLastSample: lastSample, sqlConnectionsAfterExit: PsGateCli.SqlConnections(pid), samples: outcome.SqlConnectionSamples.join('/'),
    };
  }

  /** The run the CLI child started: the person's newest orchestrator run since `since`. */
  private static async cliRunId(ctx: IntegrationCheckContext, person: UserInfo, since: Date): Promise<string> {
    const deadline = Date.now() + PsGateCli.RUN_TIMEOUT_MS;
    for (;;) {
      const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIAgentRunEntity, 'ID'>>({
        EntityName: 'MJ: AI Agent Runs', ExtraFilter: `Agent='${EscapeSQLString(PsGateAgentSession.AGENT)}' AND ParentRunID IS NULL AND StartedAt >= '${since.toISOString()}'`,
        Fields: ['ID'], OrderBy: 'StartedAt DESC', MaxRows: 1, ResultType: 'simple', BypassCache: true,
      }, person);
      if (!rows.Success) throw new Error(`G4.8: reading the CLI child's agent run failed: ${rows.ErrorMessage || 'unknown error'}`);
      if (rows.Results[0]) return rows.Results[0].ID;
      if (Date.now() > deadline) throw new Error('G4.8: the CLI child started no agent run');
      await PsGateAgentSession.Sleep(PsGateAgentSession.POLL_MS);
    }
  }

  /** True when `runId` ran its profile Action (the turn's sidecar call). */
  private static async profiled(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<boolean> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly ID: string }>({
      EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}' AND StepType='Actions' AND StepName LIKE '%${PROFILE_ACTION_NAME}%'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, person);
    if (!rows.Success) throw new Error(`G4.8: reading the steps of run ${runId} failed: ${rows.ErrorMessage || 'unknown error'}`);
    return rows.Results.length > 0;
  }

  /** The `report` rows of `runId` that record a stopped sidecar. */
  private static async sidecarStoppedRows(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<number> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly ToolCalls: string }>({
      EntityName: 'MJ: Agent Decision Logs', ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}' AND Decision='report'`, Fields: ['ToolCalls'], ResultType: 'simple', BypassCache: true,
    }, person);
    return rows.Success ? rows.Results.filter((r) => r.ToolCalls.includes(PsGateC1C34Steps.SIDECAR_STOPPED)).length : 0;
  }
}

export const PsGateC1C34Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-c3-4.G4.8', Name: 'G4.8 C1 → C3.4: a stopped sidecar ends the training run and the turn Failed within the timeout; the CLI exits non-zero', RequiresMutation: true,
    Fn: async (ctx) => {
      const url = PsGateSidecarStop.Url();
      BuildApprovalClaims.Register();
      BuildApprovalResolver.Register();
      const person = PsGateAgentSession.Person('G4.8');
      const agent = await PsGateAgentSession.Agent(person, 'G4.8');
      const world = PsGateAgentSession.World(ctx.Provider, 'G4.8');
      const timeout = PsGateSidecarStop.DECLARED_TIMEOUT_MS;
      const within = (ms: string | number | boolean | null): boolean => typeof ms === 'number' && ms >= 0 && ms <= timeout;

      let training: Record<string, string | number | boolean | null>;
      let turn: Record<string, string | number | boolean | null>;
      let success: Record<string, string | number | boolean | null>;
      try {
        training = await PsGateC1C34Steps.DuringTraining(ctx, url, agent, person, world);
        turn = await PsGateC1C34Steps.DuringTurn(ctx, url, person, world);
        success = await PsGateC1C34Steps.AfterSuccess(url);
      } finally {
        await PsGateSidecarStop.RestoreIfDown(url);
      }

      const trainingOk = training.trainingStatus === 'Failed' && within(training.trainingEndedMsAfterKill) && training.turnStatus === 'Failed' && within(training.turnEndedMsAfterKill);
      const turnOk = turn.turnStatus === 'Failed' && within(turn.turnEndedMsAfterKill) && typeof turn.cliExit === 'number' && turn.cliExit !== 0;
      const successOk = success.cliExit === 0 && success.printedResult === true && typeof success.exitMsAfterResult === 'number' && typeof success.sqlConnectionSamples === 'number' && success.sqlConnectionSamples > 0
        && success.exitMsAfterResult <= PsGateC1C34Steps.EXIT_AFTER_RESULT_MS && success.sqlConnectionsAtLastSample === 0 && success.sqlConnectionsAfterExit === 0;
      const measured = { timeoutMs: timeout, training, turn, success };
      console.log(`      → G4.8: training half ${trainingOk ? 'held' : 'failed'}, agent-turn half ${turnOk ? 'held' : 'failed'}, CLI after success ${successOk ? 'held' : 'failed'}  ${JSON.stringify(measured)}`);
      Assert(trainingOk && turnOk && successOk, `G4.8: ${JSON.stringify(measured)}`);
    },
  },
];

for (const c of PsGateC1C34Checks) IntegrationCheckRegistry.Instance.Register(c);
