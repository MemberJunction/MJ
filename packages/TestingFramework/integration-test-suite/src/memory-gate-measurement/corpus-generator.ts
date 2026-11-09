/**
 * @fileoverview Scenario and candidate note corpus generation for memory note gate measurement.
 *
 * @module @memberjunction/integration-test-suite
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BaseLLM } from '@memberjunction/ai';
import { FormatMemoryNoteExcerpt } from '@memberjunction/ai-agents';
import { AssertOutputOutsideRepo } from '@memberjunction/testing-engine';
import type {
    CorpusLabel,
    CorpusLabelRecord,
    CorpusNoteCandidate,
    CorpusScenario,
    MemoryNoteScope,
    MemoryNoteType,
    RawGeneratedCandidate,
    RawGeneratedScenario
} from './corpus-types';
import { ScoreNotesWithRetry, type ScorableCandidate } from './confidence-scorer';

export const SCENARIO_MIN_TURNS = 6;
export const SCENARIO_MAX_TURNS = 12;
export const SCENARIO_MIN_NOTES = 3;
export const SCENARIO_MAX_NOTES = 6;
export const GENERATION_MAX_RETRIES = 2;

/** Model configuration resolved for corpus generation. */
export interface ResolvedGenerationModel {
    Name: string;
    DriverClass: string;
    APIName: string;
}

/** Interface for querying models in AIEngine. */
export interface ModelVendorSource {
    Status?: string | null;
    DriverClass?: string | null;
    APIName?: string | null;
    Priority?: number | null;
}

export interface ModelSource {
    Name: string;
    IsActive: boolean;
    DriverClass?: string | null;
    APIName?: string | null;
    AIModelType: string;
    PowerRank?: number | null;
    ModelVendors?: readonly ModelVendorSource[] | null;
}

/**
 * Resolves the model through its first active vendor with an API key, then default route.
 * Follows the pattern from feat/discovery-decision-eval.
 */
export function KeyedRoute(
    model: ModelSource,
    hasKey: (driverClass: string) => boolean
): ResolvedGenerationModel | undefined {
    const vendors = [...(model.ModelVendors ?? [])]
        .filter(v => v.Status === 'Active' && !!v.DriverClass)
        .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0))
        .map(v => ({ DriverClass: v.DriverClass ?? '', APIName: v.APIName || model.APIName || '' }));

    const routes = [...vendors, { DriverClass: model.DriverClass ?? '', APIName: model.APIName ?? '' }];
    const route = routes.find(r => !!r.DriverClass && !!r.APIName && hasKey(r.DriverClass));
    return route ? { Name: model.Name, ...route } : undefined;
}

/**
 * Picks generation model from active models.
 */
export function PickGenerationModel(
    models: readonly ModelSource[],
    name: string | undefined,
    hasKey: (driverClass: string) => boolean
): ResolvedGenerationModel {
    const usable = models.filter(m => m.IsActive && !!m.DriverClass && !!m.APIName);
    if (name !== undefined) {
        const target = name.trim().toLowerCase();
        const named = usable.find(m => m.Name.trim().toLowerCase() === target);
        if (!named) {
            throw new Error(`No active model named '${name}' with a driver class and an API name`);
        }
        const route = KeyedRoute(named, hasKey);
        if (!route) {
            throw new Error(`Model '${name}' has no active vendor with an available API key`);
        }
        return route;
    }

    const best = usable
        .filter(m => m.AIModelType?.trim().toLowerCase() === 'llm' && KeyedRoute(m, hasKey) !== undefined)
        .sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0))[0];

    if (!best) {
        throw new Error('No active LLM has an API key: set AI_VENDOR_API_KEY__<DriverClass> in .env, or pass --model');
    }
    const route = KeyedRoute(best, hasKey);
    if (!route) {
        throw new Error('Failed to resolve keyed route for best available model');
    }
    return route;
}

/**
 * Builds the generation prompt for a single conversation scenario and candidate notes.
 */
export function BuildScenarioGenerationPrompt(scenarioIndex: number, totalScenarios: number): string {
    return `You are generating synthetic test data to evaluate an AI agent's memory extraction system (scenario ${scenarioIndex + 1} of ${totalScenarios}).

Generate a realistic transcript between a human user and an AI assistant, plus candidate memory notes extracted from it.

Requirements:
1. Transcript:
   - Between ${SCENARIO_MIN_TURNS} and ${SCENARIO_MAX_TURNS} alternating turns (user and assistant).
   - Realistic workplace, technical, or customer support topic.

2. Candidate Notes:
   - Between ${SCENARIO_MIN_NOTES} and ${SCENARIO_MAX_NOTES} candidate notes.
   - Types: 'Preference', 'Constraint', 'Context', 'Example', 'Issue'.
   - ScopeLevel: 'user', 'company', or 'global'.
   - Labels (ground truth):
     * "durable": True, persistent fact or preference worth remembering for future conversations. Roughly half of the notes should be durable.
     * "ephemeral": True in context, but temporary or only relevant to this single interaction.
     * "wrong": Factually contradicted by or completely unsupported by the excerpt.
     * "speculative": An unstated assumption or guess made without confirmation.

Output valid JSON only:
{
  "turns": [
    { "role": "user", "text": "..." },
    { "role": "assistant", "text": "..." }
  ],
  "notes": [
    {
      "type": "Preference",
      "scopeLevel": "user",
      "content": "Prefers SQL Server queries formatted in uppercase keywords",
      "label": "durable"
    }
  ]
}`;
}

/** Validates raw scenario structure. */
export function ValidateRawScenario(scenario: unknown): RawGeneratedScenario {
    if (!scenario || typeof scenario !== 'object') {
        throw new Error('Scenario must be an object');
    }
    const s = scenario as Record<string, unknown>;
    if (!Array.isArray(s.turns) || s.turns.length < SCENARIO_MIN_TURNS || s.turns.length > SCENARIO_MAX_TURNS) {
        throw new Error(`Scenario turns must be an array of length ${SCENARIO_MIN_TURNS}-${SCENARIO_MAX_TURNS}, got ${Array.isArray(s.turns) ? s.turns.length : 'non-array'}`);
    }

    if (!Array.isArray(s.notes) || s.notes.length < SCENARIO_MIN_NOTES || s.notes.length > SCENARIO_MAX_NOTES) {
        throw new Error(`Scenario notes must be an array of length ${SCENARIO_MIN_NOTES}-${SCENARIO_MAX_NOTES}`);
    }

    const validLabels: CorpusLabel[] = ['durable', 'ephemeral', 'wrong', 'speculative'];
    const validTypes: MemoryNoteType[] = ['Preference', 'Constraint', 'Context', 'Example', 'Issue'];
    const validScopes: MemoryNoteScope[] = ['global', 'company', 'user'];

    const validatedNotes: RawGeneratedCandidate[] = s.notes.map((n, idx) => {
        const note = n as Record<string, unknown>;
        if (typeof note.content !== 'string' || note.content.trim().length === 0) {
            throw new Error(`Note ${idx} missing valid content`);
        }
        if (!validLabels.includes(note.label as CorpusLabel)) {
            throw new Error(`Note ${idx} has invalid label: ${String(note.label)}`);
        }
        if (!validTypes.includes(note.type as MemoryNoteType)) {
            throw new Error(`Note ${idx} has invalid type: ${String(note.type)}`);
        }
        const scope = validScopes.includes(note.scopeLevel as MemoryNoteScope)
            ? (note.scopeLevel as MemoryNoteScope)
            : 'user';

        return {
            Content: note.content.trim(),
            Label: note.label as CorpusLabel,
            Type: note.type as MemoryNoteType,
            ScopeLevel: scope
        };
    });

    const validatedTurns = s.turns.map((t, idx) => {
        const turn = t as Record<string, unknown>;
        if (turn.role !== 'user' && turn.role !== 'assistant') {
            throw new Error(`Turn ${idx} has invalid role`);
        }
        if (typeof turn.text !== 'string' || turn.text.trim().length === 0) {
            throw new Error(`Turn ${idx} missing text`);
        }
        return { role: turn.role as 'user' | 'assistant', text: turn.text.trim() };
    });

    return { Turns: validatedTurns, Notes: validatedNotes };
}

/**
 * Formats transcript turns into a conversation excerpt, exactly as production's gate quotes the
 * conversation a note came from (`FormatMemoryNoteExcerpt`), so the corpus measures what ships.
 */
export function FormatConversationExcerpt(turns: readonly { role: string; text: string }[]): string {
    return FormatMemoryNoteExcerpt(turns);
}

/** Generates a single scenario with retry. */
export async function GenerateScenarioWithRetry(
    driver: Pick<BaseLLM, 'ChatCompletion'>,
    modelName: string,
    scenarioIndex: number,
    totalScenarios: number,
    maxRetries: number = GENERATION_MAX_RETRIES
): Promise<RawGeneratedScenario> {
    const prompt = BuildScenarioGenerationPrompt(scenarioIndex, totalScenarios);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await driver.ChatCompletion({
                model: modelName,
                messages: [{ role: 'user', content: prompt }]
            });
            const text = result.data.choices[0]?.message?.content ?? '';
            const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
            const parsed = JSON.parse(cleaned);
            return ValidateRawScenario(parsed);
        } catch (err) {
            lastError = err;
        }
    }

    throw new Error(`Scenario generation failed after ${maxRetries} retries: ${String(lastError)}`);
}

/** Writes corpus.jsonl and labels.jsonl to outside output directory. */
export function WriteCorpusFiles(
    outDir: string,
    scenarios: readonly CorpusScenario[],
    labels: readonly CorpusLabelRecord[],
    repoRoots: readonly string[] = []
): { corpusPath: string; labelsPath: string } {
    const checkedOutDir = AssertOutputOutsideRepo(outDir, repoRoots);
    mkdirSync(checkedOutDir, { recursive: true });

    const corpusPath = join(checkedOutDir, 'corpus.jsonl');
    const labelsPath = join(checkedOutDir, 'labels.jsonl');

    const corpusLines = scenarios.map(s => JSON.stringify(s)).join('\n') + '\n';
    const labelLines = labels.map(l => JSON.stringify(l)).join('\n') + '\n';

    writeFileSync(corpusPath, corpusLines, 'utf-8');
    writeFileSync(labelsPath, labelLines, 'utf-8');

    return { corpusPath, labelsPath };
}
