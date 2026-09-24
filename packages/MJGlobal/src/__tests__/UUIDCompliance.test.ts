/**
 * UUID Compliance Tests
 *
 * These tests scan the MemberJunction source tree for direct UUID comparison
 * patterns (=== / !==) that should use UUIDsEqual() or NormalizeUUID() instead.
 *
 * PostgreSQL returns UUIDs in lowercase while SQL Server returns uppercase.
 * Direct string comparisons break cross-database compatibility.
 *
 * If this test fails, it means new code introduced a direct UUID comparison.
 * Fix by replacing `x.ID === y` with `UUIDsEqual(x.ID, y)`.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

/** Directories that should never contain UUID comparison anti-patterns */
const SCAN_ROOT = path.resolve(__dirname, '..', '..', '..'); // packages/

/** Patterns that indicate direct UUID comparison (anti-patterns) */
const ANTI_PATTERNS = [
    /\.ID\s*===\s*(?!['"]|true|false|null|undefined|0\b)/,     // .ID === someVar (not string literals or primitives)
    /===\s*\w+\.ID\b/,                                          // something === x.ID
    /\.ID\s*!==\s*(?!['"]|true|false|null|undefined|0\b)/,     // .ID !== someVar
    /!==\s*\w+\.ID\b/,                                          // something !== x.ID
    /\.includes\(\w+\.ID\b\)/,                                   // array.includes(x.ID) — uses === internally
];

/**
 * Files/directories to exclude from scanning.
 *
 * Each pattern is matched against the path with both `\` and `/` separators.
 * On Windows, `path.join` and `fs.readdirSync` produce backslash-separated
 * paths; the previous version of these patterns used `/dist/` and `/generated/`
 * which silently never matched on Windows, producing false-positive flags for
 * generated entity_subclasses.ts, etc. Each scan now normalizes the candidate
 * path to forward slashes before testing.
 */
const EXCLUDE_PATTERNS = [
    /node_modules/,
    /\/dist\//,
    /\/generated\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /__tests__/,
    /UUIDUtils\.ts$/,           // The utility itself
    /\.js$/,                    // Only scan TypeScript source
    /\.d\.ts$/,                 // Skip declaration files
    /\.map$/,                   // Skip source maps
    /package-lock\.json$/,
];

/** Known exceptions — files where .ID === is comparing non-UUID values (e.g., numeric IDs, string enum values).
 *  Keys MUST use forward slashes; the test normalizes scanned paths to forward slashes before lookup so
 *  the same exception list works on Windows and Unix. */
const KNOWN_EXCEPTIONS: Record<string, string[]> = {
    'TestingFramework/integration-test-suite/src/checks/entity-writes.checks.ts': ['EW6 deliberately compares UUID CASE (flips it, then asserts the flip differs) to prove the case-insensitive FK round-trip — using UUIDsEqual there would defeat the check'],
    // Add file paths (relative to packages/) and the reason they're excepted
    // Example: 'SomePackage/src/file.ts': ['Uses numeric IDs, not UUIDs'],
    'Angular/Explorer/dashboards/src/Integration/components/mapping-workspace/mapping-workspace.component.ts': ['LocalID is a local string identifier (e.g. "pending-1"), not a UUID'],
    'Angular/Explorer/explorer-core/src/lib/resource-wrappers/livekit-room-resource.component.ts': ['Voice .ID is a provider-native voice slug (e.g. "echo"), not a UUID — RealtimeVoiceOption.ID'],
    'Angular/Generic/mj-livekit-room/src/lib/mj-livekit-room.component.ts': ['Voice .ID is a provider-native voice slug (e.g. "echo"), not a UUID — RealtimeVoiceOption.ID'],
    'AI/Agents/src/realtime/bridge-realtime-session-factory.ts': ['Voice .ID is a provider voice API name slug (e.g. "alloy", "echo"), not a UUID — RealtimeVoiceOption.ID'],
};

/** Normalize a path to forward slashes so EXCLUDE_PATTERNS and KNOWN_EXCEPTIONS lookups
 *  work identically on Windows and Unix. Without this, `\generated\` on Windows
 *  silently bypasses the `/generated/` filter and the test reports false positives
 *  in auto-generated code. */
function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

function shouldScanFile(filePath: string): boolean {
    if (!filePath.endsWith('.ts')) return false;
    const normalized = normalizePath(filePath);
    return !EXCLUDE_PATTERNS.some(pattern => pattern.test(normalized));
}

function findTsFiles(dir: string): string[] {
    const results: string[] = [];

    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
                continue; // Skip these directories entirely for performance
            }
            results.push(...findTsFiles(fullPath));
        } else if (shouldScanFile(fullPath)) {
            results.push(fullPath);
        }
    }
    return results;
}

interface Violation {
    file: string;
    line: number;
    content: string;
    pattern: string;
}

function scanFileForViolations(filePath: string): Violation[] {
    const violations: Violation[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Check if file is in known exceptions. Normalize to forward slashes —
    // path.relative produces backslash-separated paths on Windows, but
    // KNOWN_EXCEPTIONS keys are intentionally written with forward slashes
    // for cross-platform readability.
    const relativePath = normalizePath(path.relative(SCAN_ROOT, filePath));
    if (KNOWN_EXCEPTIONS[relativePath]) {
        return [];
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            continue;
        }

        // Skip import lines
        if (trimmed.startsWith('import ')) {
            continue;
        }

        for (const pattern of ANTI_PATTERNS) {
            if (pattern.test(line)) {
                // Additional filter: skip comparisons with empty string '', string literals, null, undefined, or type checks
                if (/\.ID\s*[!=]==?\s*''/.test(line) || /[!=]==?\s*''/.test(line)) continue;       // Comparing to empty string
                if (/\.ID\s*[!=]==?\s*['"]/.test(line)) continue;                                   // Comparing to any string literal
                if (/[!=]==?\s*['"]/.test(line) && /\.ID\b/.test(line)) continue;                    // String literal comparison involving .ID
                if (/typeof\s+\w+\.ID\s*===/.test(line)) continue;                                  // typeof check
                if (/\.ID\s*===\s*null\b/.test(line) || /\.ID\s*===\s*undefined\b/.test(line)) continue;  // null/undefined check
                if (/\.ID\s*!==\s*null\b/.test(line) || /\.ID\s*!==\s*undefined\b/.test(line)) continue;  // negated null/undefined check

                violations.push({
                    file: relativePath,
                    line: i + 1,
                    content: trimmed.substring(0, 120),
                    pattern: pattern.source,
                });
                break; // One violation per line is enough
            }
        }
    }
    return violations;
}

describe('UUID Comparison Compliance', () => {
    it('should not have direct UUID comparisons (=== / !==) in source files', () => {
        const tsFiles = findTsFiles(SCAN_ROOT);
        const allViolations: Violation[] = [];

        for (const file of tsFiles) {
            allViolations.push(...scanFileForViolations(file));
        }

        if (allViolations.length > 0) {
            const report = allViolations
                .map(v => `  ${v.file}:${v.line}: ${v.content}`)
                .join('\n');
            expect.fail(
                `Found ${allViolations.length} direct UUID comparison(s) that should use UUIDsEqual():\n${report}\n\n` +
                `Fix by replacing:\n` +
                `  - 'x.ID === y' with 'UUIDsEqual(x.ID, y)'\n` +
                `  - 'x.ID !== y' with '!UUIDsEqual(x.ID, y)'\n` +
                `  - 'arr.includes(x.ID)' with 'new UUIDSet(arr).Has(x.ID)' (or UUIDsEqual for a single check)\n` +
                `Import UUIDsEqual from '@memberjunction/global'.\n` +
                `If a comparison is NOT a UUID (e.g., numeric ID), add it to KNOWN_EXCEPTIONS in this test file.`
            );
        }
    });
});

/**
 * Nested UUID scans
 *
 * `outer.filter(x => inner.some(y => UUIDsEqual(x.ID, y)))` compares every item of one list with
 * every item of another: O(n x m), and each mismatch lowercases both strings. Inside a per-render
 * path (a getter, a template-bound method) that cost repeats on every change-detection pass — this
 * pegged a CPU core on a generated form (#4715). The set-based helpers do the same work in O(n + m).
 *
 * Detection walks the TypeScript AST (a regex cannot tell nesting from chaining): it flags a
 * `.some` / `.every` / `.find` / `.findIndex` / `.findLast` / `.filter` whose arguments call
 * `UUIDsEqual`, when that call sits inside the callback of an outer array iteration or inside a
 * loop body. A single `.find(x => UUIDsEqual(x.ID, id))` at the top level is fine and not flagged.
 *
 * NESTED_SCAN_BASELINE records the sites that predate this check, per file. It is a ratchet: a file
 * may not gain sites, and when a file's count drops the baseline must be lowered to match, so fixed
 * sites cannot quietly come back. Burn it down; don't grow it.
 */
const OUTER_ITERATIONS = new Set(['filter', 'map', 'flatMap', 'some', 'every', 'find', 'findIndex', 'findLast', 'forEach', 'reduce']);
const INNER_SCANS = new Set(['some', 'every', 'find', 'findIndex', 'findLast', 'filter']);

function methodName(call: ts.CallExpression): string | undefined {
    return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;
}

function callsUUIDsEqual(node: ts.Node): boolean {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'UUIDsEqual') return true;
    return ts.forEachChild(node, callsUUIDsEqual) ?? false;
}

function isLoop(node: ts.Node): boolean {
    return ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node);
}

/** 1-based lines of nested UUIDsEqual scans in one source file. */
export function FindNestedUUIDScans(fileName: string, text: string): number[] {
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const lines: number[] = [];
    const visit = (node: ts.Node, insideIteration: boolean): void => {
        if (ts.isCallExpression(node)) {
            const name = methodName(node);
            if (insideIteration && name && INNER_SCANS.has(name) && node.arguments.some(callsUUIDsEqual)) {
                lines.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
            }
            if (name && OUTER_ITERATIONS.has(name)) {
                visit(node.expression, insideIteration);
                for (const arg of node.arguments) visit(arg, insideIteration || ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
                return;
            }
        }
        if (isLoop(node)) {
            ts.forEachChild(node, (child) => visit(child, insideIteration || child === (node as ts.IterationStatement).statement));
            return;
        }
        ts.forEachChild(node, (child) => visit(child, insideIteration));
    };
    visit(source, false);
    return lines;
}

/** Nested-scan sites per file (relative to packages/) that predate the check. Lower these as sites are fixed. */
const NESTED_SCAN_BASELINE: Record<string, number> = {
    'AI/AgentManager/core/src/agent-spec-sync.ts': 6,
    'AI/Agents/src/ArtifactToolManager.ts': 1,
    'AI/Agents/src/SkillImportExportService.ts': 1,
    'AI/Agents/src/base-agent.ts': 29,
    'AI/Agents/src/realtime/realtime-client-session-service.ts': 2,
    'AI/BaseAIEngine/src/AIAgentPermissionHelper.ts': 1,
    'AI/BaseAIEngine/src/AISkillPermissionHelper.ts': 1,
    'AI/BaseAIEngine/src/BaseAIEngine.ts': 10,
    'AI/CorePlus/src/task-graph/flow-graph-compiler.ts': 1,
    'AI/DatabaseDesigner/actions/src/actions/list-entities.action.ts': 1,
    'AI/MCPServer/src/Server.ts': 1,
    'AI/PredictiveStudio/Engine/src/experiment/experiment-orchestrator.ts': 1,
    'AI/Prompts/src/AIPromptRunner.ts': 2,
    'AI/Prompts/src/ExecutionPlanner.ts': 4,
    'Actions/ContentAutotag/src/generic/content-autotag-and-vectorize.action.ts': 3,
    'Actions/CoreActions/src/custom/ai/base-find-agents.action.ts': 1,
    'Actions/CoreActions/src/custom/data/get-entity-details.action.ts': 1,
    'Actions/CoreActions/src/custom/user-management/assign-user-roles.action.ts': 2,
    'Actions/Engine/src/entity-actions/EntityActionInvocationTypes.ts': 2,
    'Angular/Explorer/core-entity-forms/src/lib/custom/AIAgentSessions/ai-agent-session-form.component.ts': 1,
    'Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/add-action-dialog.component.ts': 1,
    'Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/ai-agent-form.component.ts': 9,
    'Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/create-sub-agent-dialog.component.ts': 2,
    'Angular/Explorer/core-entity-forms/src/lib/custom/AIPrompts/ai-prompt-form.component.ts': 1,
    'Angular/Explorer/core-entity-forms/src/lib/custom/Entities/entity-form.component.ts': 3,
    'Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts': 1,
    'Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run-analytics.component.ts': 1,
    'Angular/Explorer/dashboards/src/AI/components/agents/agent-configuration.component.ts': 1,
    'Angular/Explorer/dashboards/src/AI/components/agents/agent-editor.component.ts': 1,
    'Angular/Explorer/dashboards/src/AI/components/analytics/agent-runs/agent-run-analysis.component.ts': 1,
    'Angular/Explorer/dashboards/src/AI/components/autotagging/tabs/health-tab.component.ts': 1,
    'Angular/Explorer/dashboards/src/AI/components/prompts/model-prompt-priority-matrix.component.ts': 3,
    'Angular/Explorer/dashboards/src/AI/components/system/system-configuration.component.ts': 3,
    'Angular/Explorer/dashboards/src/AI/components/tags/tags-resource.component.ts': 3,
    'Angular/Explorer/dashboards/src/AI/components/vectors/vector-management-resource.component.ts': 2,
    'Angular/Explorer/dashboards/src/Actions/components/actions-overview.component.ts': 3,
    'Angular/Explorer/dashboards/src/Actions/components/categories-list-view.component.ts': 1,
    'Angular/Explorer/dashboards/src/Actions/components/explorer/new-action-panel.component.ts': 1,
    'Angular/Explorer/dashboards/src/Actions/components/explorer/new-category-panel.component.ts': 1,
    'Angular/Explorer/dashboards/src/Credentials/components/credentials-list-resource.component.ts': 3,
    'Angular/Explorer/dashboards/src/Credentials/components/credentials-overview-resource.component.ts': 2,
    'Angular/Explorer/dashboards/src/DashboardBrowser/dashboard-browser-resource.component.ts': 4,
    'Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts': 2,
    'Angular/Explorer/dashboards/src/DataExplorer/services/explorer-state.service.ts': 5,
    'Angular/Explorer/dashboards/src/FormBuilder/form-builder-resource.component.ts': 2,
    'Angular/Explorer/dashboards/src/Integration/components/pipelines/pipelines.component.ts': 1,
    'Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts': 1,
    'Angular/Explorer/dashboards/src/MCP/mcp-dashboard.component.ts': 6,
    'Angular/Explorer/dashboards/src/PredictiveStudio/engine/predictive-studio.engine.ts': 1,
    'Angular/Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.ts': 2,
    'Angular/Explorer/dashboards/src/Scheduling/services/scheduling-instrumentation.service.ts': 1,
    'Angular/Explorer/dashboards/src/Testing/components/testing-explorer.component.ts': 3,
    'Angular/Explorer/explorer-core/src/lib/dashboard-preferences-dialog/dashboard-preferences-dialog.component.ts': 1,
    'Angular/Explorer/explorer-core/src/lib/profile/profile-dialog.component.ts': 1,
    'Angular/Explorer/explorer-core/src/lib/user-profile/user-profile.component.ts': 1,
    'Angular/Explorer/explorer-settings/src/lib/application-management/application-dialog/application-dialog.component.ts': 1,
    'Angular/Explorer/explorer-settings/src/lib/application-settings/application-settings.component.ts': 1,
    'Angular/Explorer/explorer-settings/src/lib/entity-permissions/permission-dialog/permission-dialog.component.ts': 1,
    'Angular/Explorer/explorer-settings/src/lib/notification-preferences/notification-preferences.component.ts': 1,
    'Angular/Explorer/explorer-settings/src/lib/user-app-config/user-app-config-content.component.ts': 1,
    'Angular/Generic/Testing/src/lib/components/test-run-dialog.component.ts': 1,
    'Angular/Generic/action-gallery/src/lib/action-gallery.component.ts': 1,
    'Angular/Generic/agents/src/lib/services/agent-permissions.service.ts': 2,
    'Angular/Generic/agents/src/lib/services/skill-permissions.service.ts': 2,
    'Angular/Generic/ai-test-harness/src/lib/ai-test-harness.component.ts': 3,
    'Angular/Generic/conversations/src/lib/components/agent/agent-process-panel.component.ts': 1,
    'Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts': 2,
    'Angular/Generic/conversations/src/lib/services/data-cache.service.ts': 1,
    'Angular/Generic/conversations/src/lib/services/user-authorization.ts': 1,
    'Angular/Generic/credentials/src/lib/panels/credential-category-edit-panel/credential-category-edit-panel.component.ts': 1,
    'Angular/Generic/dashboard-viewer/src/lib/breadcrumb/dashboard-breadcrumb.component.ts': 1,
    'Angular/Generic/dashboard-viewer/src/lib/dashboard-browser/dashboard-browser.component.ts': 1,
    'Angular/Generic/entity-communication/src/lib/preview.component.ts': 1,
    'Angular/Generic/entity-relationship-diagram/src/lib/components/entity-details/entity-details.component.ts': 1,
    'Angular/Generic/entity-relationship-diagram/src/lib/utils/entity-to-erd-adapter.ts': 2,
    'Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts': 2,
    'Angular/Generic/file-storage/src/lib/admin/storage-admin-dialog.component.ts': 6,
    'Angular/Generic/file-storage/src/lib/record-attachments/record-attachments.component.ts': 3,
    'Angular/Generic/flow-editor/src/lib/agent-editor/flow-agent-editor.component.ts': 1,
    'Angular/Generic/flow-editor/src/lib/components/flow-editor.component.ts': 1,
    'Angular/Generic/list-management/src/lib/components/list-management-dialog/list-management-dialog.component.ts': 3,
    'Angular/Generic/search/src/lib/search-scope-child-grid.component.ts': 1,
    'Angular/Generic/search/src/lib/search-scope-selector.component.ts': 1,
    'Angular/Generic/shared/src/lib/recent-access.service.ts': 1,
    'Angular/Generic/versions/src/lib/record-micro-view/record-micro-view.component.ts': 1,
    'CodeGenLib/src/Angular/angular-codegen.ts': 4,
    'CodeGenLib/src/Database/manage-metadata.ts': 7,
    'CodeGenLib/src/Database/sql_codegen.ts': 8,
    'CodeGenLib/src/Misc/action_subclasses_codegen.ts': 2,
    'Communication/base-types/src/BaseEngine.ts': 1,
    'Communication/entity-comm-base/src/base.ts': 1,
    'ContentAutotagging/src/Entity/generic/AutotagEntity.ts': 1,
    'DocUtils/src/Engine.ts': 1,
    'GenericDatabaseProvider/src/GenericDatabaseProvider.ts': 2,
    'GenericDatabaseProvider/src/UserCache.ts': 1,
    'GenericDatabaseProvider/src/queryCompositionEngine.ts': 1,
    'Integration/engine/src/BaseRESTIntegrationConnector.ts': 1,
    'MJCLI/src/commands/artifacts/reclassify.ts': 1,
    'MJCore/src/generic/baseEngine.ts': 1,
    'MJCore/src/generic/entityInfo.ts': 6,
    'MJCore/src/generic/providerBase.ts': 4,
    'MJCore/src/generic/securityInfo.ts': 1,
    'MJCoreEntities/src/custom/MJQueryEntityExtended.ts': 3,
    'MJCoreEntities/src/custom/PermissionProviders/AIAgentPermissionProvider.ts': 1,
    'MJCoreEntities/src/custom/PermissionProviders/AISkillPermissionProvider.ts': 1,
    'MJCoreEntities/src/custom/PermissionProviders/EntityPermissionProvider.ts': 1,
    'MJCoreEntities/src/custom/PermissionProviders/QueryPermissionProvider.ts': 3,
    'MJCoreEntities/src/custom/PermissionProviders/ResourcePermissionProvider.ts': 4,
    'MJCoreEntities/src/custom/ResourcePermissions/ResourcePermissionEngine.ts': 3,
    'MJCoreEntities/src/engines/FileStorageEngine.ts': 1,
    'MJCoreEntities/src/engines/UserInfoEngine.ts': 2,
    'MJCoreEntities/src/engines/conversations.ts': 2,
    'MJCoreEntities/src/engines/interactive-forms.ts': 1,
    'MJCoreEntitiesServer/src/custom/MJApplicationEntityServer.server.ts': 2,
    'MJCoreEntitiesServer/src/custom/MJEntityFieldPermissionEntityServer.server.ts': 1,
    'MJCoreEntitiesServer/src/custom/MJUserRoleEntityServer.server.ts': 2,
    'MJCoreEntitiesServer/src/custom/query-extraction/sync.ts': 6,
    'MJServer/src/resolvers/IntegrationDiscoveryResolver.ts': 1,
    'MJServer/src/resolvers/SyncRolesUsersResolver.ts': 4,
    'Scheduling/actions/src/GetJobStatisticsAction.ts': 1,
    'Scheduling/engine/src/drivers/ActionScheduledJobDriver.ts': 1,
    'SearchEngine/src/generic/SearchEngine.ts': 4,
    'SearchEngine/src/generic/StorageSearchProvider.ts': 4,
    'SearchEngine/src/generic/VectorSearchProvider.ts': 2,
    'SearchEngine/src/permissions/SearchScopePermissionResolver.ts': 1,
    'TaskGraph/src/TaskGraphDispatcher.ts': 2,
    'Templates/base-types/src/TemplateEngineBase.ts': 2,
    'TestingFramework/CLI/src/commands/list.ts': 2,
    'TestingFramework/CLI/src/lib/mj-provider.ts': 1,
    'TestingFramework/integration-test-suite/src/checks/actions-pipeline.checks.ts': 2,
    'TestingFramework/integration-test-suite/src/checks/ai-cost.checks.ts': 6,
    'TestingFramework/integration-test-suite/src/checks/ai-embeddings.checks.ts': 1,
    'TestingFramework/integration-test-suite/src/checks/ai-skills.checks.ts': 1,
    'TestingFramework/integration-test-suite/src/checks/entity-graph-client.checks.ts': 1,
    'TestingFramework/integration-test-suite/src/checks/entity-graph.checks.ts': 2,
    'TestingFramework/integration-test-suite/src/checks/metadata-sync-push.checks.ts': 2,
    'TestingFramework/integration-test-suite/src/checks/realtime-deterministic.checks.ts': 1,
    'TestingFramework/integration-test-suite/src/checks/runquery-catalog.checks.ts': 1,
    'TestingFramework/integration-test-suite/src/checks/transaction-groups-batched.checks.ts': 1,
    'TestingFramework/testing-integration/src/rls-fixture.ts': 1,
    'VersionHistory/src/DependencyGraphWalker.ts': 2,
};

describe('Nested UUID scan compliance', () => {
    it('flags only scans nested inside another iteration or a loop', () => {
        const flagged = (code: string) => FindNestedUUIDScans('sample.ts', code);
        expect(flagged('const x = rows.filter(r => ids.some(id => UUIDsEqual(id, r.ID)));')).toEqual([1]);
        expect(flagged('for (const r of rows) {\n  const m = others.find(o => UUIDsEqual(o.ID, r.ID));\n}')).toEqual([2]);
        expect(flagged('rows.forEach(function (r) { ids.findIndex(id => UUIDsEqual(id, r.ID)); });')).toEqual([1]);
        // Top-level lookups and chains are linear and must not be flagged.
        expect(flagged('const m = rows.find(r => UUIDsEqual(r.ID, id));')).toEqual([]);
        expect(flagged('const m = rows.filter(r => r.Active).find(r => UUIDsEqual(r.ID, id));')).toEqual([]);
        expect(flagged('const m = rows.filter(r => wanted.Has(r.ID));')).toEqual([]);
    });

    it('does not add nested UUIDsEqual scans beyond the recorded baseline', () => {
        const counts = new Map<string, number>();
        for (const file of findTsFiles(SCAN_ROOT)) {
            const text = fs.readFileSync(file, 'utf-8');
            if (!text.includes('UUIDsEqual')) continue;
            const sites = FindNestedUUIDScans(file, text);
            if (sites.length > 0) counts.set(normalizePath(path.relative(SCAN_ROOT, file)), sites.length);
        }

        const grown: string[] = [];
        const stale: string[] = [];
        for (const [file, count] of counts) {
            const allowed = NESTED_SCAN_BASELINE[file] ?? 0;
            if (count > allowed) grown.push(`  ${file}: ${count} nested scan(s), baseline allows ${allowed}`);
        }
        for (const [file, allowed] of Object.entries(NESTED_SCAN_BASELINE)) {
            const count = counts.get(file) ?? 0;
            if (count < allowed) stale.push(`  ${file}: baseline ${allowed}, now ${count} — lower it to ${count}${count === 0 ? ' (remove the entry)' : ''}`);
        }

        if (grown.length > 0 || stale.length > 0) {
            expect.fail(
                (grown.length > 0
                    ? `New nested UUIDsEqual scan(s) — O(n x m), and each miss allocates two strings:\n${grown.join('\n')}\n\n` +
                      `Match against a set instead (@memberjunction/global):\n` +
                      `  - keep matches:  FilterByUUIDs(items, ids[, item => item.OtherID])\n` +
                      `  - drop matches:  ExcludeByUUIDs(items, ids[, getId])\n` +
                      `  - count per ID:  CountByUUID(items[, getId]).Get(id)\n` +
                      `  - look up by ID: IndexByUUID(items[, getId]).Get(id)  /  new UUIDMap(...), new UUIDSet(...)\n` +
                      `See guides/UUID_COMPARISON_GUIDE.md, Pattern 8.\n\n`
                    : '') +
                (stale.length > 0 ? `Nested-scan baseline is stale (sites were fixed — ratchet it down in UUIDCompliance.test.ts):\n${stale.join('\n')}\n` : '')
            );
        }
    });
});
