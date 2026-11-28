/**
 * Source-scan structural ratchet for `EffectiveAgentProperties` (R2-10).
 *
 * Scans every runtime TypeScript file under `packages/AI/Agents/src/**` (excluding `__tests__/`
 * and `helpers/compat/`) and verifies that no deprecated `AIAgent` configuration column is read
 * directly on an agent object outside a `SafeResolveEffectiveAgentProperties` /
 * `ResolveEffectiveAgentProperties` fallback expression.
 *
 * Why this exists: if a future change reads `params.agent.PayloadScope` or
 * `agent.ArtifactCreationMode` directly instead of going through
 * `SafeResolveEffectiveAgentProperties(agent)`, derived agents (`BaseAgentID != null`) and
 * Category / AgentType JSON cascades silently break!
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DEPRECATED_AI_AGENT_CONFIG_COLUMNS: ReadonlyArray<string> = [
    'ModelSelectionMode',
    'DefaultPromptEffortLevel',
    'ChatHandlingOption',
    'SupportsPlanMode',
    'RequirePlanMode',
    'DeclareActionsAsNativeTools',
    'EnableContextCompression',
    'ContextCompressionMessageThreshold',
    'ContextCompressionPromptID',
    'ContextCompressionMessageRetentionCount',
    'ContextWindowMaxTokens',
    'CompactionTriggerPercent',
    'CompactionTargetPercent',
    'ConversationSummaryPromptID',
    'InjectNotes',
    'MaxNotesToInject',
    'NoteInjectionStrategy',
    'InjectExamples',
    'MaxExamplesToInject',
    'ExampleInjectionStrategy',
    'NoteRetentionDays',
    'ExampleRetentionDays',
    'AutoArchiveEnabled',
    'AllowMemoryWrite',
    'RerankerConfiguration',
    'PayloadDownstreamPaths',
    'PayloadUpstreamPaths',
    'PayloadSelfReadPaths',
    'PayloadSelfWritePaths',
    'PayloadScope',
    'StartingPayloadValidation',
    'StartingPayloadValidationMode',
    'FinalPayloadValidation',
    'FinalPayloadValidationMode',
    'FinalPayloadValidationMaxRetries',
    'ExecutionMode',
    'MinExecutionsPerRun',
    'MaxExecutionsPerRun',
    'MaxSubAgentConsultRounds',
    'MessageMode',
    'MaxMessages',
    'AttachmentRootPath',
    'InlineStorageThresholdBytes',
    'AcceptUnregisteredFiles',
    'ArtifactCreationMode',
    'DefaultArtifactTypeID',
    'SearchScopeAccess',
    'ScopeConfig',
    'SkillActivationMode',
    'AllowEphemeralClientTools',
    'RecordingDefault',
];

/**
 * Receiver expressions that refer to `MJAIAgentEntity` / `MJAIAgentEntityExtended` instances
 * (as opposed to `MJAIAgentActionEntity`, `MJAIAgentRelationshipEntity`, `MJAIAgentTypeEntity`,
 * or `EffectiveAgentProperties`).
 */
const AGENT_RECEIVER_RE =
    /\b(?:params\.agent|agent|subAgent|subAgentEntity|delegatedAgent|sa|agentOrId|input\.Agent|childAgent|parentAgent)\??\.(?<col>[A-Z][A-Za-z0-9_]*)\b/g;

const DEPRECATED_COL_SET = new Set<string>(DEPRECATED_AI_AGENT_CONFIG_COLUMNS);

function collectSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'compat') {
                continue;
            }
            out.push(...collectSourceFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            out.push(full);
        }
    }
    return out;
}

describe('EffectiveAgentProperties source-scan ratchet', () => {
    it('forbids direct reads of deprecated AIAgent config columns outside SafeResolveEffectiveAgentProperties fallbacks', () => {
        const srcRoot = path.resolve(__dirname, '..');
        const files = collectSourceFiles(srcRoot);
        expect(files.length).toBeGreaterThan(20);

        const violations: string[] = [];

        for (const filePath of files) {
            const relPath = path.relative(srcRoot, filePath);
            const lines = fs.readFileSync(filePath, 'utf8').split('\n');

            for (let idx = 0; idx < lines.length; idx++) {
                const line = lines[idx];
                const trimmed = line.trim();
                // Skip pure comments and JSDoc lines
                if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
                    continue;
                }

                AGENT_RECEIVER_RE.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = AGENT_RECEIVER_RE.exec(line)) !== null) {
                    const col = match.groups?.['col'];
                    if (!col || !DEPRECATED_COL_SET.has(col)) {
                        continue;
                    }

                    // Allow read ONLY when accompanied by ResolveEffectiveAgentProperties /
                    // SafeResolveEffectiveAgentProperties / effective-props fallback within a
                    // narrow surrounding window (same statement / try-catch diagnostic log).
                    const windowStart = Math.max(0, idx - 25);
                    const windowEnd = Math.min(lines.length - 1, idx + 4);
                    const contextWindow = lines.slice(windowStart, windowEnd + 1).join('\n');
                    const hasEffectiveFallback =
                        /SafeResolveEffectiveAgentProperties|ResolveEffectiveAgentProperties|effective[A-Z]\w*|eff\??\.|initEff\??\.|delEff\??\.|cascaded[A-Z]\w*/.test(
                            contextWindow
                        );
                    // Also allow diagnostic error-log metadata payloads right inside a catch block
                    const isCatchMetadata = /\bcatch\s*\(/.test(lines.slice(Math.max(0, idx - 12), idx + 1).join('\n'));

                    if (!hasEffectiveFallback && !isCatchMetadata) {
                        violations.push(`${relPath}:${idx + 1} reads '${match[0]}' without SafeResolveEffectiveAgentProperties`);
                    }
                }
            }
        }

        expect(violations).toEqual([]);
    });
});
