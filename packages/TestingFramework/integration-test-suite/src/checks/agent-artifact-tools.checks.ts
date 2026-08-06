/**
 * agent-artifact-tools.checks.ts — the 'agent-artifact-tools' bundle (AT1–AT9): live-model,
 * CLIENT-FIRST coverage of artifact interrogation across every artifact type, per the
 * extended-agents proposal §8.
 *
 * KEY INSIGHT (§8): artifact-tool EXTRACTION is pure code over checked-in asset bytes, so the
 * extracted values are byte-deterministic even though the tool INVOCATION is model-driven. Each
 * check asserts the extraction equals the value recorded in the assets MANIFEST.json — never model
 * prose. The single source of truth for expected values is that manifest (embedded here as
 * MANIFEST_EXPECTED, kept byte-parallel with metadata-optional/integration-test/assets/MANIFEST.json).
 *
 * HOW ARTIFACTS REACH A RUN (verified): input artifacts are gathered from the run's CONVERSATION —
 * `AgentRunner.gatherConversationArtifacts` reads the `MJ: Conversation Detail Artifacts` junction,
 * loads each `MJ: Artifact Versions` (via GetArtifactVersionsByID), decodes `data:<mime>;base64,`
 * Content through `ExtractBase64FromDataUrl`, and hands them to `ArtifactToolManager.Initialize`.
 * So each check: creates a Conversation + user ConversationDetail + Artifact/Version (text inline;
 * binary as a base64 data URL) + the junction, then runs `IT: Artifact Reader` over the wire with
 * `RunAIAgentFromConversationDetail`. The reader copies the instructed { artifactId, tool, input }
 * verbatim into one `artifactToolCalls` entry.
 *
 * WHERE THE RESULT LANDS (verified base-agent.ts:5595): each artifact tool call is wrapped in an
 * `AIAgentRunStep` (StepType='Tool', StepName `Artifact Tool: {tool}`) whose OutputData is a
 * `CarryForwardToolStepOutput` — `{ toolFamily:'Artifact', artifactId, tool, input, result:{success,
 * data, errorMessage}, durationMs }`. Checks parse `result.data` and assert it == MANIFEST.
 *
 * TWO-PHASE (§3.3): Phase P proves the instructed tool was actually invoked (a Tool step with the
 * instructed tool name exists) — bounded retries on model non-compliance, then a loud FAIL. Phase A
 * asserts the extraction (never retried). Self-cleaning: run trees + conversations + artifacts +
 * junctions are FK-ordered deleted in Teardown.
 *
 * COVERAGE HONESTY (§8, Q6): XML has NO XMLToolLibrary today — it falls back to TextToolLibrary grep
 * (AT6 pins that surface). PNG carries NO image-metadata tool — only GenericBinaryToolLibrary
 * sizeBytes/sha256 (AT7). These gaps are pinned, not tested around.
 */
import { RunView } from '@memberjunction/core';
import type {
    MJConversationEntity, MJConversationDetailEntity, MJArtifactEntity,
    MJArtifactVersionEntity, MJConversationDetailArtifactEntity, MJAIAgentEntity } from '@memberjunction/core-entities';
import { ArtifactToolManager } from '@memberjunction/ai-agents';
import { Assert, AssertEqual, IntegrationCheckRegistry, NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { AgentInvoker } from './_it-live-agent-harness';
import { userTurn } from './agent-live-shared';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import {
    resolveClient, newMarker, loadAgentByName, settle,
    readRun, readSteps, readPromptRunsForAgent, deepDeleteRunTrees, deleteMatching, runWithCompliance,
    IT_FIXTURE_TAG, AgentStepRow
} from './_it-live-agent-harness';

/**
 * Embedded expected-value manifest — kept byte-parallel with
 * metadata-optional/integration-test/assets/MANIFEST.json (checks read from here, never duplicate
 * inline constants across checks). If the assets change, both files change together.
 */
const MANIFEST_EXPECTED = {
    json: {
        topLevelKeys: ['suite', 'sentinel', 'counts', 'items', 'nested'],
        deepPath: '$.nested.level1.level2.value',
        deepValue: 'IT-DEEP-VALUE-42'
    },
    csv: {
        headers: ['OrderID', 'Customer', 'Region', 'Amount', 'Notes'],
        rowCount: 5,
        cells: { row0Customer: 'Acme Corp', row2Amount: '980.25', row4Customer: 'Stark Industries' }
    },
    xml: { grepPattern: '<name>\\w+</name>', grepMatchCount: 3 },
    md: { sentinelPattern: 'IT-MD-SENTINEL-Q3', sentinelMatchCount: 1 },
    pdf: { pageCount: 2, sentinel: 'IT-PDF-SENTINEL-Z5', sentinelPage: 1, title: 'IT Sample PDF', author: 'MJ Integration Tests' },
    png: { sizeBytes: 69, sha256: '2e9b06dc65a4dec84a3eb3124553ec93ca27c78221e64ab2177d0f1412cfcb20' }
} as const;

/** The checked-in asset bytes, embedded so artifacts are self-contained (no fs/cwd dependency). */
const ASSET_JSON = JSON.stringify({
    suite: 'agents-extended', sentinel: 'IT-JSON-SENTINEL-X9',
    counts: { alpha: 1, beta: 2, gamma: 3 },
    items: [{ id: 1, name: 'first', active: true }, { id: 2, name: 'second', active: false }, { id: 3, name: 'third', active: true }],
    nested: { level1: { level2: { value: 'IT-DEEP-VALUE-42' } } }
}, null, 2);

const ASSET_CSV = [
    'OrderID,Customer,Region,Amount,Notes',
    '1001,Acme Corp,East,250.00,IT-CSV-SENTINEL-ROW',
    '1002,Globex,West,125.50,standard',
    '1003,Initech,East,980.25,priority',
    '1004,Umbrella,North,42.00,standard',
    '1005,Stark Industries,South,6100.75,priority'
].join('\n');

const ASSET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <meta sentinel="IT-XML-SENTINEL-K7"/>
  <product id="P1">
    <name>Widget</name>
    <price currency="USD">9.99</price>
  </product>
  <product id="P2">
    <name>Gadget</name>
    <price currency="USD">19.99</price>
  </product>
  <product id="P3">
    <name>Doohickey</name>
    <price currency="EUR">4.50</price>
  </product>
</catalog>`;

const ASSET_MD = `# IT Sample Markdown Document

This file is a deterministic fixture for the agents integration suite (mj-integration-test — safe to delete).

## Section One

The quick brown fox jumps over the lazy dog.

## Section Two

Sentinel line: IT-MD-SENTINEL-Q3 appears exactly once in this document.

- bullet alpha
- bullet beta
- bullet gamma

## Section Three

The word deterministic appears here, and deterministic appears here too.`;

/** Real 2-page PDF (text layer) + PNG (1×1 red) bytes, base64 — matched to the MANIFEST sha256s. */
const ASSET_PDF_B64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUiA1IDAgUl0gL0NvdW50IDIgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNyAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA5OSA+PgpzdHJlYW0KQlQKL0YxIDEyIFRmCjcyIDcyMCBUZAooSVQgU2FtcGxlIFBERiAtIFBhZ2UgT25lLiBJVC1QREYtU0VOVElORUwtWjUgaXMgdGhlIHNlbnRpbmVsIHBocmFzZS4pIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9Db250ZW50cyA2IDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA3IDAgUiA+PiA+PiA+PgplbmRvYmoKNiAwIG9iago8PCAvTGVuZ3RoIDY5ID4+CnN0cmVhbQpCVAovRjEgMTIgVGYKNzIgNzIwIFRkCihQYWdlIFR3byBjb250ZW50OiB0aGUgcXVpY2sgYnJvd24gZm94LikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago3IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKOCAwIG9iago8PCAvVGl0bGUgKElUIFNhbXBsZSBQREYpIC9BdXRob3IgKE1KIEludGVncmF0aW9uIFRlc3RzKSA+PgplbmRvYmoKeHJlZgowIDkKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAowMDAwMDAwMjQ3IDAwMDAwIG4gCjAwMDAwMDAzOTYgMDAwMDAgbiAKMDAwMDAwMDUyMiAwMDAwMCBuIAowMDAwMDAwNjQxIDAwMDAwIG4gCjAwMDAwMDA3MTEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA5IC9Sb290IDEgMCBSIC9JbmZvIDggMCBSID4+CnN0YXJ0eHJlZgo3ODYKJSVFT0YK';
const ASSET_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQD3A0FDAAAAAElFTkSuQmCC';

/** The `result` object inside a Tool step's CarryForwardToolStepOutput. */
interface ToolStepResult {
    tool: string;
    artifactId: string;
    result: { success: boolean; data: unknown; errorMessage?: string };
}

/** Module-level fixture (no IntegrationCheckContext slot — the framework package is not modified). */
interface ArtifactToolsFixture {
    Client?: AgentInvoker;
    ReaderID: string;
    Reader?: MJAIAgentEntity;
    EnvironmentID?: string;
    TypeIds: Record<string, string>;
    CreatedRootRunIds: string[];
    ConversationIds: string[];
    ArtifactIds: string[];
    ArtifactVersionIds: string[];
    JunctionIds: string[];
    Skip?: string;
}

let fixture: ArtifactToolsFixture | undefined;

function requireFixture(): ArtifactToolsFixture {
    if (!fixture) throw new Error('agent-artifact-tools fixture not initialized — Setup must run first.');
    return fixture;
}

function guardOrSkip(checkId: string): ArtifactToolsFixture | undefined {
    const fx = requireFixture();
    if (fx.Skip) { console.warn(`  ⚠ agent-artifact-tools.${checkId} SKIPPED — ${fx.Skip}`); return undefined; }
    return fx;
}

/** Create Conversation + user ConversationDetail + Artifact/Version + junction; return the detail ID. */
async function attachArtifact(
    ctx: IntegrationCheckContext, fx: ArtifactToolsFixture,
    typeName: string, mimeType: string, content: string, isBinary: boolean, userMessage: string
): Promise<string> {
    const marker = newMarker('IT-AT');
    const name = `IT Artifact ${marker} ${IT_FIXTURE_TAG}`;

    const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
    conversation.Name = name;
    conversation.UserID = ctx.User.ID;
    if (fx.EnvironmentID) conversation.EnvironmentID = fx.EnvironmentID;
    Assert(await conversation.Save(), `conversation save: ${conversation.LatestResult?.CompleteMessage}`);
    fx.ConversationIds.push(conversation.ID);

    const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
    detail.ConversationID = conversation.ID;
    detail.Role = 'User';
    detail.Message = userMessage;
    detail.UserID = ctx.User.ID;
    Assert(await detail.Save(), `conversation detail save: ${detail.LatestResult?.CompleteMessage}`);

    const typeId = fx.TypeIds[typeName];
    Assert(!!typeId, `artifact type '${typeName}' resolved`);
    const artifact = await ctx.Provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
    artifact.Name = name;
    artifact.TypeID = typeId;
    artifact.UserID = ctx.User.ID;
    if (fx.EnvironmentID) artifact.EnvironmentID = fx.EnvironmentID;
    Assert(await artifact.Save(), `artifact save: ${artifact.LatestResult?.CompleteMessage}`);
    fx.ArtifactIds.push(artifact.ID);

    const version = await ctx.Provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
    version.ArtifactID = artifact.ID;
    version.VersionNumber = 1;
    version.Name = name;
    version.ContentMode = 'Text'; // inline Content (not File-backed) — gather reads Content directly
    version.MimeType = mimeType;
    version.Content = isBinary ? `data:${mimeType};base64,${content}` : content;
    version.UserID = ctx.User.ID;
    Assert(await version.Save(), `artifact version save: ${version.LatestResult?.CompleteMessage}`);
    fx.ArtifactVersionIds.push(version.ID);

    const junction = await ctx.Provider.GetEntityObject<MJConversationDetailArtifactEntity>('MJ: Conversation Detail Artifacts', ctx.User);
    junction.ConversationDetailID = detail.ID;
    junction.ArtifactVersionID = version.ID;
    junction.Direction = 'Input';
    Assert(await junction.Save(), `conversation detail artifact junction save: ${junction.LatestResult?.CompleteMessage}`);
    fx.JunctionIds.push(junction.ID);

    return detail.ID;
}

/** Run IT: Artifact Reader from a conversation detail and return the persisted root run ID. */
async function runReader(fx: ArtifactToolsFixture, conversationDetailId: string, userMessage: string): Promise<string | undefined> {
    if (!fx.Client || !fx.Reader) return undefined;
    // 🚨 The instruction MUST be passed as the turn's message, not left implicit in the
    // ConversationDetail. `conversationDetailId` links the run to the conversation and carries the
    // ARTIFACTS; it does not deliver the user's text to the prompt — the production resolver builds
    // `conversationMessages` from the conversation and passes them explicitly, and this harness must
    // do the same. Passing `[]` here (as it originally did) meant the reader was told "call get_rows
    // with this input" only in a database row the model never sees; it then guessed, and seven
    // checks reported `model-noncompliance:` for an instruction that was never delivered. Its own
    // reasoning gave it away: "User message does not explicitly restate a tool call in this turn".
    // Server-in-process (Q8): the reader runs against the conversation detail — the artifacts
    // reach the run via the MJ: Conversation Detail Artifacts junction + conversationDetailId,
    // exactly as the wire RunAIAgentFromConversationDetail path did, but synchronously.
    const result = await fx.Client.RunAIAgent(
        { agent: fx.Reader, conversationDetailId, conversationMessages: userTurn(userMessage) } as unknown as ExecuteAgentParams
    );
    await settle(2500); // let the fire-and-forget Tool/prompt step saves flush
    const runId = (result as unknown as { agentRun?: { ID?: string } }).agentRun?.ID;
    if (runId) fx.CreatedRootRunIds.push(runId);
    return runId;
}

/** Build the imperative tool-call instruction the reader copies verbatim. */
function toolInstruction(tool: string, input: Record<string, unknown>): string {
    return `Call exactly one artifact tool now against artifact A. tool: "${tool}". input: ${JSON.stringify(input)}. ` +
        `Copy artifactId "A", the tool name, and the input object verbatim into a single artifactToolCalls entry.`;
}

/** Parse the first Tool step's CarryForwardToolStepOutput (the artifact-tool result). */
function firstToolResult(steps: AgentStepRow[]): ToolStepResult | undefined {
    for (const s of steps) {
        if (s.StepType !== 'Tool' || !s.OutputData) continue;
        try {
            const parsed = JSON.parse(s.OutputData) as ToolStepResult;
            if (parsed && parsed.result) return parsed;
        } catch { /* skip */ }
    }
    return undefined;
}

/** Read steps then extract the tool result (undefined if the model never called the tool). */
async function readToolResult(ctx: IntegrationCheckContext, runId: string): Promise<ToolStepResult | undefined> {
    return firstToolResult(await readSteps(ctx.Provider, ctx.User, runId));
}

/** Run a single-artifact interrogation with two-phase compliance keyed on the instructed tool name. */
async function interrogate(
    ctx: IntegrationCheckContext, fx: ArtifactToolsFixture,
    typeName: string, mimeType: string, content: string, isBinary: boolean,
    tool: string, input: Record<string, unknown>, label: string
): Promise<ToolStepResult> {
    const runId = await runWithCompliance(
        async () => {
            const instruction = toolInstruction(tool, input);
            const detailId = await attachArtifact(ctx, fx, typeName, mimeType, content, isBinary, instruction);
            return runReader(fx, detailId, instruction);
        },
        async (id) => (await readToolResult(ctx, id))?.tool === tool,
        label,
        3,
        // What the run ACTUALLY produced: the steps it took and what the model wrote. Distinguishes
        // "the model declined" from "the tool was never advertised" and from "the response was empty".
        async (id) => {
            const steps = await readSteps(ctx.Provider, ctx.User, id);
            const shape = steps.map((s) => s.StepType).join(' → ') || '(no steps)';
            const runs = await readPromptRunsForAgent(ctx.Provider, ctx.User, [id], fx.ReaderID);
            const said = runs.map((r) => (r.Result ?? '').slice(0, 700)).join('\n    ---\n') || '(no prompt runs)';
            return `    steps:    ${shape}\n    model said: ${said}`;
        }
    );
    const tr = await readToolResult(ctx, runId);
    Assert(!!tr && tr.tool === tool, `${label}: the instructed tool '${tool}' was invoked (P-artifact)`);
    return tr!;
}

function asRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export const ArtifactToolsChecks: NamedCheck[] = [
    {
        Id: 'agent-artifact-tools.AT1',
        Name: 'AT1: turn-1 prompt Messages lists the attached artifact with its alpha ID (manifest seam)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT1'); if (!fx) return;
            // "do not call any tool" → the reader completes immediately; we only prove the manifest reached the prompt.
            const runId = await runWithCompliance(
                async () => {
                    const instruction = 'Do not call any tool.';
                    const detailId = await attachArtifact(ctx, fx, 'JSON', 'application/json', ASSET_JSON, false, instruction);
                    return runReader(fx, detailId, instruction);
                },
                async (id) => (await readPromptRunsForAgent(ctx.Provider, ctx.User, [id], fx.ReaderID)).length > 0,
                'AT1 manifest'
            );
            const prompts = await readPromptRunsForAgent(ctx.Provider, ctx.User, [runId], fx.ReaderID);
            const firstMessages = prompts.map((p) => p.Messages ?? '').join('\n');
            Assert(firstMessages.includes('Available Artifacts'), 'AT1: the artifact manifest was not injected into the prompt');
            Assert(/\bA\b/.test(firstMessages) && firstMessages.includes('IT Artifact'), 'AT1: the manifest did not list the artifact by alpha ID + name');
        }
    },
    {
        Id: 'agent-artifact-tools.AT2',
        Name: 'AT2: CSV get_rows — exact rowCount (total) and known cell values match MANIFEST',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT2'); if (!fx) return;
            const tr = await interrogate(ctx, fx, 'CSV', 'text/csv', ASSET_CSV, false, 'get_rows', { start: 0, count: 5 }, 'AT2 CSV get_rows');
            const data = asRecord(tr.result.data);
            AssertEqual(data.total, MANIFEST_EXPECTED.csv.rowCount, 'AT2: CSV total row count');
            const rows = Array.isArray(data.rows) ? (data.rows as Array<Record<string, unknown>>) : [];
            AssertEqual(rows.length, 5, 'AT2: get_rows returned all 5 rows');
            AssertEqual(rows[0]?.Customer, MANIFEST_EXPECTED.csv.cells.row0Customer, 'AT2: row0.Customer');
            AssertEqual(rows[2]?.Amount, MANIFEST_EXPECTED.csv.cells.row2Amount, 'AT2: row2.Amount');
            AssertEqual(rows[4]?.Customer, MANIFEST_EXPECTED.csv.cells.row4Customer, 'AT2: row4.Customer');
            AssertEqual(Object.keys(rows[0] ?? {}).join(','), MANIFEST_EXPECTED.csv.headers.join(','), 'AT2: column headers');
        }
    },
    {
        Id: 'agent-artifact-tools.AT3',
        Name: 'AT3: JSON json_path (deep value) + json_keys (top-level key set) match MANIFEST',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT3'); if (!fx) return;
            const pathRes = await interrogate(ctx, fx, 'JSON', 'application/json', ASSET_JSON, false, 'json_path', { path: MANIFEST_EXPECTED.json.deepPath }, 'AT3 json_path');
            AssertEqual(pathRes.result.data, MANIFEST_EXPECTED.json.deepValue, 'AT3: json_path deep value');

            const keysRes = await interrogate(ctx, fx, 'JSON', 'application/json', ASSET_JSON, false, 'json_keys', { path: '' }, 'AT3 json_keys');
            const keys = Array.isArray(keysRes.result.data) ? (keysRes.result.data as string[]) : [];
            AssertEqual(keys.join(','), MANIFEST_EXPECTED.json.topLevelKeys.join(','), 'AT3: json_keys top-level key set');
        }
    },
    {
        Id: 'agent-artifact-tools.AT4',
        Name: 'AT4: PDF get_page_count / search_text (page-located sentinel) / get_metadata match MANIFEST (pdfjs extraction)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT4'); if (!fx) return;
            const pc = await interrogate(ctx, fx, 'PDF', 'application/pdf', ASSET_PDF_B64, true, 'get_page_count', {}, 'AT4 page_count');
            AssertEqual(asRecord(pc.result.data).pageCount, MANIFEST_EXPECTED.pdf.pageCount, 'AT4: PDF page count');

            const st = await interrogate(ctx, fx, 'PDF', 'application/pdf', ASSET_PDF_B64, true, 'search_text', { query: MANIFEST_EXPECTED.pdf.sentinel }, 'AT4 search_text');
            const matches = Array.isArray(asRecord(st.result.data).matches) ? (asRecord(st.result.data).matches as Array<Record<string, unknown>>) : [];
            Assert(matches.length > 0, 'AT4: search_text did not find the seeded PDF sentinel');
            AssertEqual(matches[0]?.page, MANIFEST_EXPECTED.pdf.sentinelPage, 'AT4: sentinel located on the wrong page');

            const md = await interrogate(ctx, fx, 'PDF', 'application/pdf', ASSET_PDF_B64, true, 'get_metadata', {}, 'AT4 metadata');
            AssertEqual(asRecord(md.result.data).title, MANIFEST_EXPECTED.pdf.title, 'AT4: PDF metadata title');
            AssertEqual(asRecord(md.result.data).author, MANIFEST_EXPECTED.pdf.author, 'AT4: PDF metadata author');
        }
    },
    {
        Id: 'agent-artifact-tools.AT5',
        Name: 'AT5: Markdown grep — exact match count for a sentinel regex (text library)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT5'); if (!fx) return;
            const tr = await interrogate(ctx, fx, 'Markdown Document', 'text/markdown', ASSET_MD, false, 'grep', { pattern: MANIFEST_EXPECTED.md.sentinelPattern }, 'AT5 MD grep');
            const matches = Array.isArray(tr.result.data) ? (tr.result.data as unknown[]) : [];
            AssertEqual(matches.length, MANIFEST_EXPECTED.md.sentinelMatchCount, 'AT5: markdown grep match count');
        }
    },
    {
        Id: 'agent-artifact-tools.AT6',
        Name: 'AT6: XML falls back to TextToolLibrary grep (no XMLToolLibrary today — pins current surface, Q6)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT6'); if (!fx) return;
            // XML artifact type has no ToolLibraryClass → composite chain resolves to TextToolLibrary; grep works.
            const tr = await interrogate(ctx, fx, 'XML', 'application/xml', ASSET_XML, false, 'grep', { pattern: MANIFEST_EXPECTED.xml.grepPattern }, 'AT6 XML grep');
            const matches = Array.isArray(tr.result.data) ? (tr.result.data as unknown[]) : [];
            AssertEqual(matches.length, MANIFEST_EXPECTED.xml.grepMatchCount, 'AT6: XML grep <name> match count (via TextToolLibrary fallback)');
        }
    },
    {
        Id: 'agent-artifact-tools.AT7',
        Name: 'AT7: PNG as Generic Binary — get_metadata sizeBytes + sha256 equal MANIFEST (the universal binary anchor)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT7'); if (!fx) return;
            // Attach the PNG as Generic Binary so the get_metadata (sizeBytes/sha256) tool is available.
            const tr = await interrogate(ctx, fx, 'Generic Binary', 'image/png', ASSET_PNG_B64, true, 'get_metadata', {}, 'AT7 PNG binary');
            AssertEqual(asRecord(tr.result.data).sizeBytes, MANIFEST_EXPECTED.png.sizeBytes, 'AT7: PNG sizeBytes (store→decode→tool chain)');
            AssertEqual(asRecord(tr.result.data).sha256, MANIFEST_EXPECTED.png.sha256, 'AT7: PNG sha256');
        }
    },
    {
        Id: 'agent-artifact-tools.AT8',
        Name: 'AT8: a malformed JSON artifact yields a STRUCTURED error result, and the run still reaches terminal',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT8'); if (!fx) return;
            const runId = await runWithCompliance(
                async () => {
                    const instruction = toolInstruction('json_path', { path: '$.truncated' });
                    const detailId = await attachArtifact(ctx, fx, 'JSON', 'application/json', '{ "truncated": ', false, instruction);
                    return runReader(fx, detailId, instruction);
                },
                async (id) => (await readToolResult(ctx, id))?.tool === 'json_path',
                'AT8 malformed-json'
            );
            const tr = await readToolResult(ctx, runId);
            Assert(!!tr && tr.result.success === false, 'AT8: a malformed artifact did not surface a structured failure result');
            Assert(!!tr!.result.errorMessage, 'AT8: the structured error carried no message');
            const run = await readRun(ctx.Provider, ctx.User, runId);
            Assert(run?.Status === 'Completed' || run?.Status === 'AwaitingFeedback',
                `AT8: one bad artifact crashed the whole run (Status=${run?.Status})`);
        }
    },
    {
        Id: 'agent-artifact-tools.AT9',
        Name: 'AT9: a >50k text artifact is delivered tools-only — content NOT inlined in the prompt, tools still reach it',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('AT9'); if (!fx) return;
            // Deterministic pin (no LLM): the 50k externalization boundary.
            const under = ArtifactToolManager.ShouldExternalizeContent(50_000);
            const over = ArtifactToolManager.ShouldExternalizeContent(50_001);
            Assert(!under.shouldExternalize && over.shouldExternalize, 'AT9: the 50k externalization boundary shifted');

            const marker = newMarker('IT-AT9');
            const deepSentinel = `IT-AT9-DEEP-${marker}`;
            const big = 'x'.repeat(60_000) + `\n${deepSentinel}\n` + 'y'.repeat(5_000);
            const runId = await runWithCompliance(
                async () => {
                    const instruction = toolInstruction('grep', { pattern: deepSentinel });
                    const detailId = await attachArtifact(ctx, fx, 'Generic Text', 'text/plain', big, false, instruction);
                    return runReader(fx, detailId, instruction);
                },
                async (id) => (await readToolResult(ctx, id))?.tool === 'grep',
                'AT9 large-text'
            );
            const tr = await readToolResult(ctx, runId);
            const matches = tr && Array.isArray(tr.result.data) ? (tr.result.data as unknown[]) : [];
            Assert(matches.length === 1, 'AT9: the tool did not reach into the large (tools-only) artifact content');

            // The 60k body must NOT have been inlined into the prompt (tools-only delivery for large artifacts).
            //
            // 🚨 Assert on the BODY, not on the sentinel. An artifact tool result is appended to the
            // conversation as a user turn ("Artifact tool result: ..."), so the very grep this check
            // instructs necessarily echoes the matched line — sentinel and all — into the NEXT turn's
            // prompt. A `!allMessages.includes(deepSentinel)` oracle therefore fires on its own
            // success and reports a context blow-up that never happened. What actually distinguishes
            // inlining from tools-only delivery is whether the 65k filler body travelled with the
            // prompt, so that is what we test.
            const prompts = await readPromptRunsForAgent(ctx.Provider, ctx.User, [runId], fx.ReaderID);
            const allMessages = prompts.map((p) => p.Messages ?? '').join('\n');
            const bodyProbe = 'x'.repeat(10_000); // a slab only the inlined 60k body could contain
            Assert(!allMessages.includes(bodyProbe), 'AT9: large artifact CONTENT was inlined into the prompt (context blow-up)');
        }
    }
];

for (const check of ArtifactToolsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-artifact-tools', {
    Setup: async (ctx: IntegrationCheckContext) => {
        fixture = {
            ReaderID: '', TypeIds: {}, CreatedRootRunIds: [],
            ConversationIds: [], ArtifactIds: [], ArtifactVersionIds: [], JunctionIds: []
        };
        const client = resolveClient(ctx.Provider, ctx.User);
        const reader = await loadAgentByName(ctx.Provider, ctx.User, 'IT: Artifact Reader');
        if (!reader) {
            fixture.Skip = 'IT: Artifact Reader not seeded — run: npx mj sync push --dir=metadata-optional/integration-test';
            return;
        }
        // Resolve the artifact type IDs the bundle attaches to.
        const typeNames = ['JSON', 'CSV', 'PDF', 'Markdown Document', 'XML', 'Generic Binary', 'Generic Text'];
        const types = await new RunView().RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: `Name IN (${typeNames.map((n) => `'${n}'`).join(',')})`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple'
        }, ctx.User);
        if (types.Success) for (const t of types.Results) fixture.TypeIds[t.Name] = t.ID;
        const missing = typeNames.filter((n) => !fixture!.TypeIds[n]);
        if (missing.length > 0) { fixture.Skip = `artifact types not found: ${missing.join(', ')}`; return; }

        // Resolve an environment for the Conversation/Artifact rows (EnvironmentID is non-null).
        const env = await new RunView().RunView<{ ID: string }>({
            EntityName: 'MJ: Environments', Fields: ['ID'], MaxRows: 1, ResultType: 'simple'
        }, ctx.User);
        if (env.Success && env.Results.length > 0) fixture.EnvironmentID = env.Results[0].ID;

        fixture.Client = client;
        fixture.ReaderID = reader.ID;
        fixture.Reader = reader;
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const fx = fixture;
        if (!fx) return;
        // 1. Run trees (steps → prompt runs → runs) the reader spawned.
        await deepDeleteRunTrees(ctx.Provider, ctx.User, fx.CreatedRootRunIds);
        // 2. Junctions → versions → artifacts (FK order).
        for (const id of fx.JunctionIds) await deleteMatching(ctx.Provider, ctx.User, 'MJ: Conversation Detail Artifacts', `ID='${id}'`);
        for (const id of fx.ArtifactVersionIds) await deleteMatching(ctx.Provider, ctx.User, 'MJ: Artifact Versions', `ID='${id}'`);
        for (const id of fx.ArtifactIds) await deleteMatching(ctx.Provider, ctx.User, 'MJ: Artifacts', `ID='${id}'`);
        // 3. All conversation details (user + any agent responses) → conversations.
        for (const id of fx.ConversationIds) await deleteMatching(ctx.Provider, ctx.User, 'MJ: Conversation Details', `ConversationID='${id}'`);
        for (const id of fx.ConversationIds) await deleteMatching(ctx.Provider, ctx.User, 'MJ: Conversations', `ID='${id}'`);
        fixture = undefined;
    }
});
