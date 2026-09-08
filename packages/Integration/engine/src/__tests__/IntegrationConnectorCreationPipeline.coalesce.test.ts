import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntegrationConnectorCreationPipeline } from '../IntegrationConnectorCreationPipeline';

/**
 * The pipeline coalesces duplicate runs for the same CompanyIntegration. A coalesced call never
 * reaches `runInternal`, so it never uses a caller-supplied `opts.RunID`.
 *
 * That matters because IntegrationCreateConnection / IntegrationUpdateConnection can launch the
 * refresh DETACHED: they mint a run ID, hand it to the client as "tail this", and only then call
 * `Run()`. On create the connection's IsActive false→true Save has already awaited a full pipeline
 * run for the same CompanyIntegration, so the resolver's call lands inside the coalesce window every
 * time. Without an alias, the minted ID names a run directory that is never created, the detached
 * promise RESOLVES (so the launcher's rejection handler never fires), and the client polls
 * IntegrationTailRunEvents forever on `Run '<id>' not found` — which reads exactly like
 * "not started yet".
 *
 * These tests pin the alias: a caller-supplied run ID is always tailable and always terminal.
 *
 * NOTE: the coalesce maps are STATIC and keyed by CompanyIntegrationID, so every test uses its own
 * CompanyIntegrationID — otherwise one test's just-completed run coalesces the next test's first call.
 */
describe('IntegrationConnectorCreationPipeline — caller-supplied RunID under coalescing', () => {
    let artifactRoot: string;
    let ciSeq = 0;

    /** Fails at ConnectionTest so the pipeline returns (it does not throw) without any live work. */
    const failingConnector = {
        TestConnection: async () => ({ Success: false, Message: 'credentials rejected' }),
        IntrospectSchema: async () => { throw new Error('unreachable'); },
    };

    type Connector = typeof failingConnector;
    type RunArgs = Parameters<IntegrationConnectorCreationPipeline['Run']>[0];

    /** Binds a fresh CompanyIntegrationID so each test gets clean coalesce state. */
    function newConnection(connector: Connector = failingConnector) {
        const ciID = `CI-COALESCE-${++ciSeq}`;
        return (runID?: string) =>
            new IntegrationConnectorCreationPipeline().Run({
                Connector: connector,
                CompanyIntegration: { ID: ciID, IntegrationID: `INT-${ciID}`, Integration: 'TestVendor' },
                ContextUser: { ID: 'U-TEST' },
                ConsoleMirror: false,
                TriggerType: 'Manual' as const,
                ArtifactRootDir: artifactRoot,
                RunID: runID,
            } as unknown as RunArgs);
    }

    const readResult = (runID: string) =>
        JSON.parse(readFileSync(join(artifactRoot, runID, 'result.json'), 'utf8')) as {
            runID: string; success: boolean; exitReason: string;
        };
    const readEvents = (runID: string) => readFileSync(join(artifactRoot, runID, 'progress.jsonl'), 'utf8');

    beforeEach(() => {
        artifactRoot = mkdtempSync(join(tmpdir(), 'mj-coalesce-'));
        delete process.env.MJ_CONNECTOR_PIPELINE_COALESCE_WINDOW_MS;
    });

    afterEach(() => {
        rmSync(artifactRoot, { recursive: true, force: true });
        delete process.env.MJ_CONNECTOR_PIPELINE_COALESCE_WINDOW_MS;
    });

    it('publishes a tailable alias run when coalescing serves a different run', async () => {
        const run = newConnection();
        // 1. The IsActive Save-hook's run — no caller RunID, so the pipeline mints its own.
        const hook = await run(undefined);

        // 2. The resolver's detached launch, milliseconds later, with the ID already given to the client.
        const MINTED = 'connector-MINTED-BY-RESOLVER';
        const detached = await run(MINTED);

        // Coalescing served it from the hook's run — a caller that awaits still learns the true ID.
        expect(detached.RunID).toBe(hook.RunID);

        // ...but the ID the client was told to tail now EXISTS and is terminal.
        expect(existsSync(join(artifactRoot, MINTED))).toBe(true);
        const alias = readResult(MINTED);
        expect(alias.runID).toBe(MINTED);
        expect(alias.exitReason).toBe('failed'); // mirrors the served run

        // And it names the run that actually did the work, so a client can hop to the full stream.
        expect(readEvents(MINTED)).toContain(hook.RunID);
    });

    it('mirrors a served run that FAILED — an alias must never read as a clean refresh', async () => {
        const run = newConnection();
        const hook = await run(undefined);
        expect(hook.Success).toBe(false);

        const MINTED = 'connector-MINTED-FAILCASE';
        await run(MINTED);

        expect(readEvents(MINTED)).toContain('credentials rejected');
        expect(readResult(MINTED).success).toBe(false);
    });

    it('writes no alias when the caller supplied no RunID', async () => {
        const run = newConnection();
        const hook = await run(undefined);
        const second = await run(undefined);

        expect(second.RunID).toBe(hook.RunID);
        expect(readdirSync(artifactRoot)).toEqual([hook.RunID]);
    });

    it('writes no alias when the run was NOT coalesced — the requested ID is the real run', async () => {
        process.env.MJ_CONNECTOR_PIPELINE_COALESCE_WINDOW_MS = '1';
        const run = newConnection();
        const first = await run(undefined);
        await new Promise(r => setTimeout(r, 20)); // let the coalesce window lapse

        const MINTED = 'connector-MINTED-FRESH';
        const fresh = await run(MINTED);

        expect(fresh.RunID).toBe(MINTED); // ran for real under the requested ID
        expect(readdirSync(artifactRoot).sort()).toEqual([first.RunID, MINTED].sort());
        // A real run, not an alias: it went through the ConnectionTest stage.
        expect(readEvents(MINTED)).toContain('ConnectionTest');
    });

    it('shares an IN-FLIGHT run and still aliases the requested ID', async () => {
        // Hold the first run open so the second call hits inFlightRuns rather than recentRuns.
        let release: () => void = () => {};
        const gate = new Promise<void>(r => { release = r; });
        const run = newConnection({
            TestConnection: async () => { await gate; return { Success: false, Message: 'slow reject' }; },
            IntrospectSchema: async () => { throw new Error('unreachable'); },
        });

        const inFlight = run(undefined);
        await new Promise(r => setTimeout(r, 5));
        const MINTED = 'connector-MINTED-INFLIGHT';
        const joined = run(MINTED);
        release();

        const [a, b] = await Promise.all([inFlight, joined]);
        expect(b.RunID).toBe(a.RunID);
        expect(existsSync(join(artifactRoot, MINTED))).toBe(true);
        expect(readResult(MINTED).success).toBe(false);
    });
});
