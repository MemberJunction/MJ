/**
 * edit-template-and-run.ts — feature-pipeline rig: in ONE process, run a pipeline on one record, edit the prompt's
 * template content through an entity save, run again, and print whether each prompt run rendered the marker.
 * The process stays alive across the edit, exactly as a running MJAPI does, so the second run only sees the edit if
 * the template engine and the cached prompt pick it up without a restart.
 * The rig edits the content row the prompt renders: the template's highest-priority content
 * (`MJTemplateEntityExtended.SelectHighestPriorityContent`, the same rule the prompt's TemplateText uses).
 * Usage (from the MJ repo root, private env loaded):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/edit-template-and-run.ts <RecordProcessID> <RecordID> [--revert]
 *   --revert: remove the marker instead of appending it (restores the original text).
 * Exit: 0 = both runs returned and the expectations held, 1 = an expectation failed, 2 = bootstrap or usage error.
 */
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { MJTemplateEntityExtended } from '@memberjunction/core-entities';
import type { MJAIPromptRunEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { BootstrapIntegrationServer, Settle, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import { RigCLI, RigFixtures, RigUsageError } from '../lib/rig-cli';

/**
 * The marker text, and the marker the rig appends. Each run's marker carries a fresh stamp: a repeat of an earlier
 * edit would hash to a prompt version the pipeline cache already holds (a cache hit, no new prompt run), so the
 * rig could only pass once per database. `--revert` removes every marker this rig ever appended.
 */
const MARKER_TEXT = 'template-edit-rig';
const MARKER_PATTERN = / <!-- template-edit-rig[^>]*-->/g;
const USAGE = 'usage: edit-template-and-run.ts <RecordProcessID> <RecordID> [--revert]';
/** How long the rig waits for the saved edit to reach the cached prompt. */
const REFRESH_TIMEOUT_MS = 10_000;

/** The parsed command line. */
interface RigArgs {
    RecordProcessID: string;
    RecordID: string;
    Revert: boolean;
}

/** What one pipeline run produced, as seen through the latest prompt run and the cached prompt. */
interface RunObservation {
    PromptRunID: string | undefined;
    RenderedMarker: boolean;
    PromptTextMarker: boolean;
}

/** Parses and checks the command line. @throws RigUsageError on a missing argument. */
function parseArgs(): RigArgs {
    const [recordProcessID, recordID] = [process.argv[2], process.argv[3]];
    if (!recordProcessID || recordProcessID.startsWith('--') || !recordID || recordID.startsWith('--')) {
        throw new RigUsageError('the first two arguments must be the Record Process ID and the Record ID');
    }
    return { RecordProcessID: recordProcessID, RecordID: recordID, Revert: process.argv.includes('--revert') };
}

/**
 * Polls `condition` every 100 ms until it holds.
 * @returns true when the condition held within `timeoutMs`, false on timeout
 */
async function waitFor(condition: () => boolean, timeoutMs: number, description: string): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (condition()) {
            return true;
        }
        await Settle(100);
    }
    console.error(`timed out after ${timeoutMs} ms waiting for ${description}`);
    return condition();
}

/**
 * The content row the prompt renders: the template's highest-priority content, the row its TemplateText reads.
 * @throws Error when the template has no content or the read fails.
 */
async function loadRenderedContent(ctx: IntegrationBootstrapContext, templateID: string): Promise<MJTemplateContentEntity> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTemplateContentEntity>({
        EntityName: 'MJ: Template Contents',
        ExtraFilter: `TemplateID = '${EscapeSQLString(templateID)}'`,
        ResultType: 'entity_object',
    }, ctx.User);
    const tc = res.Success ? MJTemplateEntityExtended.SelectHighestPriorityContent(res.Results) : undefined;
    if (!tc) {
        throw new Error(`no template content for template '${templateID}'${res.Success ? '' : `: ${res.ErrorMessage}`}`);
    }
    return tc;
}

/** Runs the pipeline on the one record, then reads the prompt's latest run and the cached prompt text. */
async function observeRun(
    ctx: IntegrationBootstrapContext, recordProcessID: string, prompt: MJAIPromptEntityExtended, recordID: string, label: string,
): Promise<RunObservation> {
    const result = await new RecordProcessExecutor().RunByID(recordProcessID, {
        contextUser: ctx.User,
        provider: ctx.Provider,
        triggeredBy: 'OnDemand',
        scope: { Kind: 'records', RecordIDs: [recordID] },
    });
    const pr = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIPromptRunEntity>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `PromptID = '${EscapeSQLString(prompt.ID)}'`,
        OrderBy: 'RunAt DESC',
        MaxRows: 1,
        ResultType: 'entity_object',
    }, ctx.User);
    const latest = pr.Success ? pr.Results?.[0] : undefined;
    const observation: RunObservation = {
        PromptRunID: latest?.ID,
        RenderedMarker: (latest?.Messages || '').includes(MARKER_TEXT),
        PromptTextMarker: prompt.TemplateText.includes(MARKER_TEXT),
    };
    console.log(`${label}: status=${result.Status} promptRun=${observation.PromptRunID} rendered-marker=${observation.RenderedMarker} promptText-marker=${observation.PromptTextMarker}`);
    return observation;
}

/** The expectations that failed, given the two observations around the edit. */
function collectFailures(args: RigArgs, refreshed: boolean, before: RunObservation, after: RunObservation): string[] {
    const failures: string[] = [];
    if (!refreshed) {
        failures.push('the cached prompt never saw the saved template text');
    }
    if (args.Revert) {
        // The reverted text hashes to an already-cached pin, so the run is a cache hit and makes no prompt run.
        if (after.PromptTextMarker) failures.push('after-edit promptText-marker should be false');
        return failures;
    }
    // before-edit's rendered-marker reports the latest prompt run, which may predate this process; not asserted
    if (before.PromptTextMarker) failures.push('before-edit promptText-marker should be false');
    if (!after.PromptTextMarker) failures.push('after-edit promptText-marker should be true');
    if (!after.RenderedMarker) failures.push('after-edit rendered-marker should be true');
    if (before.PromptRunID !== undefined && after.PromptRunID !== undefined && UUIDsEqual(before.PromptRunID, after.PromptRunID)) {
        failures.push('after-edit made no new prompt run');
    }
    return failures;
}

async function main(): Promise<number> {
    const args = parseArgs();
    const ctx = await BootstrapIntegrationServer();
    try {
        const rp = await RigFixtures.LoadRecordProcess(ctx, args.RecordProcessID);
        await AIEngine.Instance.Config(false, ctx.User);
        const prompt = rp.PromptID ? AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, rp.PromptID)) : undefined;
        if (!prompt?.TemplateID) {
            console.error(`Record Process '${rp.Name}' has no prompt in AIEngine, or its prompt has no template`);
            return 2;
        }
        await TemplateEngineBase.Instance.Config(false, ctx.User);
        const tc = await loadRenderedContent(ctx, prompt.TemplateID);

        const before = await observeRun(ctx, rp.ID, prompt, args.RecordID, 'before-edit');
        const originalText = tc.TemplateText || '';
        const editedText = args.Revert
            ? originalText.replace(MARKER_PATTERN, '')
            : `${originalText} <!-- ${MARKER_TEXT} ${new Date().toISOString()} -->`;
        tc.TemplateText = editedText;
        if (!(await tc.Save())) {
            console.error(`could not save the template content: ${tc.LatestResult?.CompleteMessage || 'unknown error'}`);
            return 2;
        }
        // the save raises an entity event; wait until the template engine has reloaded and the prompt reads the edit
        const refreshed = await waitFor(() => prompt.TemplateText === editedText, REFRESH_TIMEOUT_MS, 'the template engine refresh');
        const after = await observeRun(ctx, rp.ID, prompt, args.RecordID, 'after-edit');

        const failures = collectFailures(args, refreshed, before, after);
        for (const f of failures) {
            console.error(`FAIL: ${f}`);
        }
        return failures.length === 0 ? 0 : 1;
    } finally {
        await ctx.ClosePool();
    }
}

void RigCLI.Main(main, USAGE);
