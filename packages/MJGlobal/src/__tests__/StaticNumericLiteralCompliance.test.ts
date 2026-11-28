/**
 * Static Numeric Literal Compliance Tests
 *
 * Scans the MemberJunction `packages/` source tree using the TypeScript AST to enforce that:
 * 1. Class `static readonly` (or `static SCREAMING_SNAKE_CASE`) numeric literals / arithmetic
 *    expressions, and
 * 2. Module-level `MAX_*` / `MIN_*` / `DEFAULT_*` / `LIMIT_*` / `CAP_*` numeric `const` declarations
 *
 * carry an explicit rationale comment (either an inline trailing `// ...` / `/* ... *\/` comment
 * on the declaration line, or an immediately preceding `/** ... *\/` / `// ...` comment block with
 * no blank-line gap) explaining *why* that value exists (protocol spec, unit conversion,
 * `mj.config.cjs` / `LimitsConfigResolver` fallback default, etc.).
 *
 * Performance optimization and memory design in MJ must rely on deterministic lifecycle and object
 * scoping (`WeakMap<IMetadataProvider, ...>`, per-run instance fields cleared in `finally`,
 * `Settled().finally(...)`, and configurable idle TTLs) rather than undocumented magic count caps.
 * See `.claude/rules/typescript-style.md` ("NO ARBITRARY HARD CAPS OR UNEXPLAINED STATIC NUMERIC LITERALS").
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

const SCAN_ROOT = path.resolve(__dirname, '..', '..', '..'); // packages/
const MIN_SCANNED_FILES = 3000; // Floor guarding against an accidentally narrowed SCAN_ROOT

const EXCLUDE_PATTERNS = [
    /node_modules/,
    /\/dist\//,
    /\/build\//,
    /\/generated\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /\.dom\.test\.ts$/,
    /__tests__/,
    /__mocks__/,
    /\/unit-testing\//,
    /\.d\.ts$/,
];

const MODULE_BOUND_CONST_NAME_RE = /^(?:MAX_|MIN_|DEFAULT_|LIMIT_|CAP_)[A-Z0-9_]*$/;
const SCREAMING_SNAKE_NAME_RE = /^[A-Z][A-Z0-9_]+$/;

export interface UndocumentedNumericLiteralHit {
    Line: number;
    Name: string;
    Expression: string;
    Kind: 'static-property' | 'module-const';
}

function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

function shouldScanFile(filePath: string): boolean {
    if (!filePath.endsWith('.ts')) return false;
    const normalized = normalizePath(filePath);
    return !EXCLUDE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findTsFiles(dir: string, results: string[] = []): string[] {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === '.git' ||
            entry.name === '.turbo'
        ) {
            continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            findTsFiles(fullPath, results);
        } else if (shouldScanFile(fullPath)) {
            results.push(fullPath);
        }
    }
    return results;
}

function isNumericConstantExpression(node: ts.Node): boolean {
    if (ts.isNumericLiteral(node)) {
        return true;
    }
    if (
        ts.isPrefixUnaryExpression(node) &&
        (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
    ) {
        return isNumericConstantExpression(node.operand);
    }
    if (ts.isParenthesizedExpression(node)) {
        return isNumericConstantExpression(node.expression);
    }
    if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.AsteriskToken ||
            node.operatorToken.kind === ts.SyntaxKind.SlashToken ||
            node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
            node.operatorToken.kind === ts.SyntaxKind.MinusToken ||
            node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken)
    ) {
        return isNumericConstantExpression(node.left) && isNumericConstantExpression(node.right);
    }
    return false;
}

/**
 * Requires at least 10 characters and at least 2 alphabetical words so trivial comments like
 * `// 50` or `// 16 MB` (restating the number without explaining its purpose) are rejected.
 */
function isSubstantiveRationale(text: string): boolean {
    if (text.length < 10) return false;
    const words = text.match(/[A-Za-z]{2,}/g) ?? [];
    return words.length >= 2;
}

function hasExplanationComment(lines: string[], startLineZeroBased: number, endLineZeroBased: number): boolean {
    for (let l = startLineZeroBased; l <= endLineZeroBased; l++) {
        const line = lines[l] ?? '';
        const match = line.match(/\/\/\s*(.+)$|\/\*\s*(.+?)\s*\*\//);
        const inlineText = (match?.[1] ?? match?.[2] ?? '').trim();
        if (isSubstantiveRationale(inlineText)) {
            return true;
        }
    }

    const precedingLines: string[] = [];
    for (let l = startLineZeroBased - 1; l >= 0; l--) {
        const trimmed = (lines[l] ?? '').trim();
        if (trimmed === '') break;
        if (
            trimmed.startsWith('//') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('/*') ||
            trimmed.endsWith('*/')
        ) {
            const cleaned = trimmed
                .replace(/^(\/\/+|\/\*+|\*+\/?)/g, '')
                .replace(/\*+\/$/g, '')
                .trim();
            precedingLines.push(cleaned);
            continue;
        }
        break;
    }
    return isSubstantiveRationale(precedingLines.join(' ').trim());
}

/**
 * Parses `text` with TypeScript's AST and returns every undocumented static class numeric constant
 * and undocumented module-level `MAX_*`/`MIN_*`/`DEFAULT_*`/`LIMIT_*`/`CAP_*` numeric constant.
 */
export function FindUndocumentedStaticNumericLiterals(
    fileName: string,
    text: string
): UndocumentedNumericLiteralHit[] {
    const lines = text.split(/\r?\n/);
    const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const hits: UndocumentedNumericLiteralHit[] = [];

    const visit = (node: ts.Node): void => {
        if (
            ts.isPropertyDeclaration(node) &&
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) &&
            node.initializer &&
            isNumericConstantExpression(node.initializer)
        ) {
            const name = node.name.getText(sf);
            const isReadonlyOrConstCased =
                node.modifiers.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ||
                SCREAMING_SNAKE_NAME_RE.test(name);
            if (isReadonlyOrConstCased) {
                const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
                const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
                if (!hasExplanationComment(lines, startLine, endLine)) {
                    hits.push({
                        Line: startLine + 1,
                        Name: name,
                        Expression: node.initializer.getText(sf),
                        Kind: 'static-property',
                    });
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);

    for (const stmt of sf.statements) {
        if (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0) {
            for (const decl of stmt.declarationList.declarations) {
                if (
                    ts.isIdentifier(decl.name) &&
                    MODULE_BOUND_CONST_NAME_RE.test(decl.name.text) &&
                    decl.initializer &&
                    isNumericConstantExpression(decl.initializer)
                ) {
                    const startLine = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line;
                    const endLine = sf.getLineAndCharacterOfPosition(stmt.getEnd()).line;
                    if (!hasExplanationComment(lines, startLine, endLine)) {
                        hits.push({
                            Line: startLine + 1,
                            Name: decl.name.text,
                            Expression: decl.initializer.getText(sf),
                            Kind: 'module-const',
                        });
                    }
                }
            }
        }
    }

    return hits.sort((a, b) => a.Line - b.Line || a.Name.localeCompare(b.Name));
}

/**
 * Pre-existing undocumented static/bound numeric literal counts per file (relative to `packages/`).
 * Ratchet-only: new files must have 0 violations, existing files cannot grow, and fixing a legacy
 * file requires lowering or removing its entry here.
 */
const UNDOCUMENTED_STATIC_NUMERIC_BASELINE: Record<string, number> = {
    'AI/AICLI/src/lib/text-formatter.ts': 2,
    'AI/AgentHarness/src/HarnessAgentBase.ts': 2,
    'AI/AgentHarness/src/HarnessQuotaClassifier.ts': 1,
    'AI/AgentHarness/src/adapters/BaseCliHarnessAdapter.ts': 2,
    'AI/Agents/src/AgentWakeTriggerService.ts': 1,
    'AI/Agents/src/artifact-tools/DocumentToolLibrary.ts': 5,
    'AI/Agents/src/artifact-tools/SpreadsheetToolLibrary.ts': 9,
    'AI/Agents/src/artifact-tools/grepHelper.ts': 5,
    'AI/Agents/src/pipeline/pipeline-docs.ts': 1,
    'AI/BaseAIEngine/src/AIAgentPermissionHelper.ts': 1,
    'AI/BaseAIEngine/src/BaseAIEngine.ts': 2,
    'AI/ComputerUse/src/engine/ComputerUseEngine.ts': 2,
    'AI/ComputerUse/src/engine/step-control.ts': 1,
    'AI/ContextCrush/src/code/crush-code.ts': 1,
    'AI/ContextCrush/src/crush-json.ts': 4,
    'AI/Diagrams/src/validator.ts': 2,
    'AI/MCPServer/src/auth/OAuthProxyRouter.ts': 1,
    'AI/PredictiveStudio/Engine/src/monitoring/period-evaluation.ts': 2,
    'AI/PredictiveStudio/Engine/src/monitoring/registry-check-driver.ts': 1,
    'AI/PredictiveStudio/TruthSuite/src/db/bulk-load.ts': 1,
    'AI/Providers/AssemblyAI/src/voice/assemblyAIStreamingSTT.ts': 1,
    'AI/Providers/LocalEmbeddings/src/models/embeddingRuntime.ts': 2,
    'AI/RealtimeBridge/Base/src/turn-taking-policy.ts': 3,
    'AI/RealtimeBridge/Providers/LiveKitNative/src/media-worker-session.ts': 1,
    'AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts': 3,
    'AI/RealtimeClient/src/drivers/openAILiveClient.ts': 6,
    'AI/Vectors/Memory/src/models/VectorStore.ts': 1,
    'AI/VideoStudio/Engine/src/agents/critic-agent.ts': 1,
    'AI/VideoStudio/Engine/src/render/docker-render-driver.ts': 1,
    'AI/VideoStudio/Engine/src/render/fake-render-driver.ts': 3,
    'AI/VideoStudio/Engine/src/render/local-worker-render-driver.ts': 1,
    'AI/VideoStudio/Engine/src/review/critic-input.ts': 1,
    'AI/VideoStudio/Engine/src/storage.ts': 1,
    'Actions/ApolloEnrichment/src/accounts.ts': 1,
    'Actions/ApolloEnrichment/src/people/ApolloPeopleClient.ts': 2,
    'Actions/BizApps/FormBuilders/src/shared/file-content-processor.ts': 1,
    'Actions/BizApps/LMS/src/providers/learnworlds/learnworlds-base.action.ts': 5,
    'Actions/BizApps/Social/src/providers/buffer/buffer-base.action.ts': 2,
    'Actions/CoreActions/src/custom/ai/base-find-skills.action.ts': 4,
    'Actions/CoreActions/src/custom/data/find-graph-path.action.ts': 2,
    'Actions/CoreActions/src/custom/data/get-graph-context.action.ts': 6,
    'Actions/CoreActions/src/custom/geo/scheduled-geocoding.action.ts': 2,
    'Actions/CoreActions/src/custom/web/brave-search.action.ts': 1,
    'Actions/CoreActions/src/custom/web/perplexity-search.action.ts': 1,
    'Actions/CoreActions/src/custom/web/rss-feed-read.action.ts': 3,
    'Actions/CoreActions/src/custom/web/tavily-search.action.ts': 1,
    'Actions/PeopleDataLabs/src/PDLPersonClient.ts': 2,
    'Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts': 1,
    'Angular/Explorer/dashboards/src/AI/components/autotagging/components/classify-overview-analytics.component.ts': 2,
    'Angular/Explorer/dashboards/src/AI/components/autotagging/dialogs/dry-run-preview.dialog.component.ts': 1,
    'Angular/Explorer/dashboards/src/AI/components/autotagging/dialogs/source-type-form.dialog.component.ts': 1,
    'Angular/Explorer/dashboards/src/APIKeys/api-applications-panel.component.ts': 3,
    'Angular/Explorer/dashboards/src/DataExplorer/services/explorer-state.service.ts': 3,
    'Angular/Explorer/dashboards/src/Home/home-application.ts': 1,
    'Angular/Explorer/dashboards/src/PredictiveStudio/engine/predictive-studio.engine.ts': 1,
    'Angular/Explorer/dashboards/src/PredictiveStudio/production-distribution.ts': 1,
    'Angular/Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.ts': 3,
    'Angular/Explorer/dashboards/src/VideoStudio/components/vs-production-brief.component.ts': 3,
    'Angular/Explorer/dashboards/src/Workflows/components/workflow-runs-resource.component.ts': 2,
    'Angular/Explorer/explorer-core/src/lib/resource-wrappers/library-agent-context.ts': 1,
    'Angular/Explorer/explorer-core/src/lib/services/server-connectivity.service.ts': 2,
    'Angular/Generic/agent-requests/src/lib/panels/agent-request-panel/agent-request-panel.component.ts': 3,
    'Angular/Generic/artifacts/src/lib/components/artifact-viewer-panel.component.ts': 1,
    'Angular/Generic/artifacts/src/lib/components/context-menu/mj-context-menu.component.ts': 2,
    'Angular/Generic/artifacts/src/lib/services/document-collaboration.service.ts': 1,
    'Angular/Generic/artifacts/src/lib/utils/artifact-dom-capture.ts': 4,
    'Angular/Generic/base-forms/src/lib/comments/record-comments.component.ts': 3,
    'Angular/Generic/base-forms/src/lib/field/default-fk-lookup-strategy.ts': 1,
    'Angular/Generic/base-forms/src/lib/links/record-links.component.ts': 2,
    'Angular/Generic/base-forms/src/lib/panel-slot/collect-form-contribution-registrations.ts': 1,
    'Angular/Generic/base-forms/src/lib/preview-popover/record-preview-popover.component.ts': 2,
    'Angular/Generic/brand-kits/src/lib/brand-kit-creator/brand-kit-creator.component.ts': 1,
    'Angular/Generic/conversations/src/lib/components/library/library-remote-drive-pane.component.ts': 2,
    'Angular/Generic/conversations/src/lib/components/message/message-list.component.ts': 1,
    'Angular/Generic/conversations/src/lib/components/overlay/chat-overlay.component.ts': 6,
    'Angular/Generic/conversations/src/lib/components/realtime/identity-verification/identity-verification-model.ts': 2,
    'Angular/Generic/conversations/src/lib/components/realtime/remote-browser/remote-browser-channel.ts': 3,
    'Angular/Generic/dashboard-viewer/src/lib/models/dashboard-layout-editor.ts': 2,
    'Angular/Generic/diagnostics/src/lib/breadcrumbs.ts': 2,
    'Angular/Generic/flow-editor/src/lib/services/flow-layout.service.ts': 4,
    'Angular/Generic/flow-editor/src/lib/services/flow-viewport.util.ts': 1,
    'Angular/Generic/media-player/src/lib/storage-media-player/storage-media-player.component.ts': 1,
    'Angular/Generic/task-graph-editor/src/lib/debug-variables.ts': 2,
    'Angular/Generic/task-graph-editor/src/lib/pane-split.ts': 1,
    'Angular/Generic/whiteboard/src/lib/whiteboard-state.ts': 2,
    'CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts': 1,
    'Communication/engine/src/CalendarEventLinks.ts': 1,
    'ContentPipeline/engine/src/ArtifactGraphIndexer.ts': 1,
    'ConversationsRuntime/src/mentions/MentionAutocomplete.ts': 2,
    'DBAutoDoc/src/plugins/PluginManager.ts': 1,
    'DBAutoDoc/src/plugins/index-advisor/IndexLLMReview.ts': 4,
    'Diagnostics/Core/src/crypto.ts': 1,
    'Diagnostics/Core/src/senderAuth.ts': 1,
    'Diagnostics/Server/src/intakeRoutes.ts': 1,
    'Diagnostics/Server/src/retentionJobDriver.ts': 1,
    'GraphQLDataProvider/src/ClientTabInvalidationMultiplexer.ts': 1,
    'GraphQLDataProvider/src/SharedTabKernelClient.ts': 2,
    'GraphQLDataProvider/src/SharedTabKernelHost.ts': 7,
    'Health/src/MJHealthEngine.ts': 1,
    'Health/src/otel/OtelSpanBridge.ts': 1,
    'Health/src/telemetry/LocalTelemetrySignalBridge.ts': 2,
    'Integration/engine/src/RateLimiter.ts': 2,
    'Integration/engine/src/RecordFlatten.ts': 1,
    'Integration/engine/src/auth-helpers/OAuth2TokenManager.ts': 2,
    'Integration/engine/src/peer-sync/PeerSyncEndpointService.ts': 1,
    'LiveKitRoomCore/src/livekit-preview-room-controller.ts': 1,
    'MJCLI/src/commands/queue/work.ts': 2,
    'MJCLI/src/lib/dev-workspace/detect.ts': 1,
    'MJCLI/src/lib/regression/test-scaffold.ts': 1,
    'MJCLI/src/lib/work-queue/queue-format.ts': 1,
    'MJCodeGenAPI/src/codegenRunRoute.ts': 1,
    'MJCore/src/generic/RegisterForStartup.ts': 1,
    'MJCore/src/generic/baseEngineRegistry.ts': 1,
    'MJCore/src/generic/databaseProviderBase.ts': 1,
    'MJCore/src/generic/entityConfiguration.ts': 2,
    'MJCoreEntities/src/custom/ArtifactPermissionDelegate.ts': 2,
    'MJCoreEntities/src/custom/ArtifactPreviewSnapshot.ts': 1,
    'MJCoreEntities/src/custom/DocumentLiveBlockEngine.ts': 1,
    'MJCoreEntities/src/custom/PermissionProviders/CollectionPermissionProvider.ts': 1,
    'MJCoreEntities/src/custom/Permissions/MJCollectionPermissionEntityExtended.ts': 1,
    'MJCoreEntities/src/custom/SpreadsheetEngine.ts': 31,
    'MJCoreEntities/src/graph/DomainClustering.ts': 6,
    'MJCoreEntitiesServer/src/custom/ArtifactSecurityHookHelpers.ts': 5,
    'MJCoreEntitiesServer/src/custom/MJCollectionArtifactEntityServer.server.ts': 1,
    'MJCoreEntitiesServer/src/custom/MJCollectionEntityServer.server.ts': 1,
    'MJGlobal/src/fieldRules/SafeTransformAstEvaluator.ts': 4,
    'MJServer/src/collaboration/LivingReportScheduleHelpers.ts': 2,
    'MJServer/src/operations/ArtifactComplianceAuditHelper.ts': 2,
    'MJServer/src/operations/ArtifactEvaluateAiFormulaServerOperation.ts': 4,
    'MJServer/src/operations/ArtifactGuestShareServerOperations.ts': 3,
    'MJServer/src/realtimeSessions/verificationPolicy.ts': 8,
    'MJServer/src/realtimeWidget/WidgetSessionService.ts': 2,
    'MJServer/src/resolvers/DocumentCollaborationResolver.ts': 2,
    'MJServer/src/resolvers/IntegrationDiscoveryResolver.ts': 1,
    'MJServer/src/resolvers/RealtimeClientSessionResolver.ts': 4,
    'MessagingAdapters/src/email/InboundUtilityMailboxIngestionService.ts': 1,
    'MessagingAdapters/src/slack/SlackAdapter.ts': 2,
    'MessagingAdapters/src/teams/TeamsAdapter.ts': 3,
    'OfficeAddins/Excel/src/contract.ts': 2,
    'OfficeAddins/Excel/src/handoff.ts': 1,
    'OfficeAddins/ExcelServer/src/manifest-builder.ts': 1,
    'OfficeAddins/ExcelServer/src/operations.ts': 1,
    'OfficeAddins/ExcelServer/src/settings.ts': 3,
    'OfficeAddins/ExcelServer/src/sources.ts': 1,
    'OfficeAddins/ExcelServer/src/workbook-builder.ts': 2,
    'RecordCloning/base/src/EffectiveOptions.ts': 1,
    'RecordSetProcessor/engine/src/RateLimiter.ts': 3,
    'SQLParser/src/template/branchVariants.ts': 1,
    'SQLParser/src/template/expressionParser.ts': 1,
    'SQLServerDataProvider/src/SQLServerDataProvider.ts': 1,
    'Scheduling/engine/src/WakeGateEvaluator.ts': 2,
    'SearchEngine/src/generic/GraphSearchProvider.ts': 2,
    'SearchEngine/src/generic/VectorSearchProvider.ts': 3,
    'SearchEngine/src/rerankers/BGEReRanker.ts': 1,
    'ServerExtensionsCore/src/collect.ts': 1,
    'TaskGraph/src/TaskGraphGovernanceCoordinator.ts': 2,
    'TelephonyAdapters/src/telephony/LiveKitSipTelephonyService.ts': 1,
    'TelephonyAdapters/src/telephony/outboundCallPolicy.ts': 3,
    'TestingFramework/integration-test-suite/rigs/generate-discovery-corpus.ts': 2,
    'TestingFramework/integration-test-suite/rigs/generate-memory-note-corpus.ts': 2,
    'TestingFramework/integration-test-suite/rigs/memory-note-gate-measurement.ts': 1,
    'WorkQueue/aws/src/driver/publish.ts': 1,
    'WorkQueue/azure/src/config.ts': 1,
    'WorkQueue/azure/src/driver/publish.ts': 1,
    'WorkQueue/core/src/api/restContract.ts': 1,
    'WorkQueue/core/src/runtime/DeliveryExecution.ts': 1,
    'WorkQueue/core/src/validation.ts': 8,
    'WorkQueue/engine/src/host/WorkQueueHost.ts': 2,
    'WorkQueue/gcp/src/config.ts': 1,
    'WorkQueue/gcp/src/envelope.ts': 1,
    'WorkQueue/server/src/publishRequests.ts': 1,
};

describe('Static Numeric Literal Rationale Compliance', () => {
    it('flags unexplained static/bound numeric literals while accepting inline or attached rationale comments', () => {
        const badCode = [
            'const MAX_CACHED_ITEMS = 50;',
            'const MAX_FRAME_BYTES = 16 * 1024 * 1024; // 16 MB',
            'export class Foo {',
            '    public static readonly MAX_CACHED_CONVERSATION_DETAILS = 50;',
            '    private static readonly retryDelayMs = 250;',
            '    private static nextId = 1;',
            '}',
        ].join('\n');

        const hits = FindUndocumentedStaticNumericLiterals('sample.ts', badCode);
        // Flags the bare const, the unit-only "// 16 MB" const, and both undocumented static readonly fields,
        // while ignoring mutable counter `private static nextId = 1`.
        expect(hits.map((h) => h.Name)).toEqual([
            'MAX_CACHED_ITEMS',
            'MAX_FRAME_BYTES',
            'MAX_CACHED_CONVERSATION_DETAILS',
            'retryDelayMs',
        ]);

        const goodCode = [
            '/** Fallback idle timeout when mcpServerSettings.sessionIdleTtlMs is unset. */',
            'export const DEFAULT_IDLE_TTL_MS = 24 * 60 * 60 * 1000;',
            'const MAX_SEARCH_RESULTS = 50; // Per-call search hit ceiling so response fits in model context',
            'export class Bar {',
            '    // 30s negative-cache TTL when no policy row exists yet',
            '    private static readonly NONE_POLICY_CACHE_TTL_MS = 30_000;',
            '    public static readonly DEFAULT_SWEEP_MS = 5 * 60 * 1000; // 5m fallback background sweep cadence',
            '}',
        ].join('\n');

        expect(FindUndocumentedStaticNumericLiterals('good.ts', goodCode)).toEqual([]);
    });

    it('scans the full packages/ source tree and forbids new unexplained static numeric literals', () => {
        const files = findTsFiles(SCAN_ROOT);
        expect(files.length).toBeGreaterThan(MIN_SCANNED_FILES);

        const violationsByFile = new Map<string, UndocumentedNumericLiteralHit[]>();
        for (const file of files) {
            const text = fs.readFileSync(file, 'utf-8');
            const hits = FindUndocumentedStaticNumericLiterals(file, text);
            if (hits.length > 0) {
                violationsByFile.set(normalizePath(path.relative(SCAN_ROOT, file)), hits);
            }
        }

        const grown: string[] = [];
        const stale: string[] = [];

        for (const [relFile, hits] of violationsByFile) {
            const allowed = UNDOCUMENTED_STATIC_NUMERIC_BASELINE[relFile] ?? 0;
            if (hits.length > allowed) {
                const detail = hits
                    .map((h) => `    line ${h.Line}: ${h.Name} = ${h.Expression} (${h.Kind})`)
                    .join('\n');
                grown.push(
                    `  ${relFile}: ${hits.length} undocumented literal(s), baseline allows ${allowed}:\n${detail}`
                );
            }
        }

        for (const [relFile, allowed] of Object.entries(UNDOCUMENTED_STATIC_NUMERIC_BASELINE)) {
            const actual = violationsByFile.get(relFile)?.length ?? 0;
            if (actual < allowed) {
                stale.push(
                    `  ${relFile}: baseline ${allowed}, now ${actual} — lower it to ${actual}${
                        actual === 0 ? ' (remove the entry)' : ''
                    }`
                );
            }
        }

        if (grown.length > 0 || stale.length > 0) {
            expect.fail(
                (grown.length > 0
                    ? `Undocumented static/bound numeric literal(s) detected:\n${grown.join('\n')}\n\n` +
                      `Rule (.claude/rules/typescript-style.md — NO ARBITRARY HARD CAPS OR UNEXPLAINED STATIC NUMERIC LITERALS):\n` +
                      `  1. Never use arbitrary count caps (MAX_* = 50) as a band-aid for lifecycle/scoping bugs — use WeakMap, per-run instance fields, Settled().finally(), or configurable idle TTLs instead.\n` +
                      `  2. Every legitimate static numeric constant or module-level MAX_/MIN_/DEFAULT_/LIMIT_/CAP_ const MUST include an inline or attached comment explaining why that value exists.\n\n`
                    : '') +
                    (stale.length > 0
                        ? `Static numeric literal baseline is stale (sites were documented or removed — ratchet down UNDOCUMENTED_STATIC_NUMERIC_BASELINE in StaticNumericLiteralCompliance.test.ts):\n${stale.join('\n')}\n`
                        : '')
            );
        }
    });
});
