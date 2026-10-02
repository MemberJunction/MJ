/**
 * @fileoverview CLI harness to generate a synthetic duplicate corpus from existing MemberJunction records.
 *
 * Generates:
 * - corpus.jsonl: synthetic records (duplicates and hard negatives)
 * - labels.jsonl: ground truth labels ('duplicate' with SourceRecordId, or 'new' with NearRecordId)
 * - generated-from.json: metadata recording the generation parameters
 *
 * USAGE:
 *   npx tsx rigs/generate-dupe-corpus.ts --entity "MJ: Actions" --fields Name,Description --out <dir> \
 *     [--duplicates 80] [--new 80] [--seed 7] [--model "<model name>"] [--dry-run]
 *
 * SAFETY:
 *   --out MUST be outside any git working tree. Inside-repo paths are refused by AssertOutputOutsideRepo.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
    AssertOutputOutsideRepo,
    CreateSeededRandom,
    DECISION_EVAL_SEED,
} from '@memberjunction/testing-engine';
import { LoadEnv } from '@memberjunction/testing-integration';
import { MJGlobal } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseLLM, ChatMessageRole, ChatParams, GetAIAPIKey } from '@memberjunction/ai';
import '@memberjunction/server-bootstrap-lite';

import { BootstrapAI } from './lib/ai-bootstrap';
import {
    BuildDuplicateUserPrompt,
    BuildHardNegativeUserPrompt,
    CorpusRecord,
    DUPLICATE_GENERATION_SYSTEM_PROMPT,
    DuplicateCorpusLabel,
    GeneratedFromMetadata,
    HARD_NEGATIVE_GENERATION_SYSTEM_PROMPT,
    IsExactMatchWithExisting,
    NewCorpusLabel,
    SampleSourceRecords,
    ValidateGeneratorReply,
    WriteCorpusFiles,
} from '../src/dupe-check-measurement';

interface GeneratorCliOptions {
    Entity: string;
    Fields: string[];
    OutDir: string;
    Duplicates: number;
    New: number;
    Seed: number;
    ModelName: string | null;
    DryRun: boolean;
}

function readFlag(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
}

function parseCliArgs(argv: string[]): GeneratorCliOptions {
    const entity = readFlag(argv, 'entity');
    if (!entity) {
        throw new Error('Missing required argument: --entity "<name>"');
    }

    const fieldsRaw = readFlag(argv, 'fields');
    if (!fieldsRaw) {
        throw new Error('Missing required argument: --fields <Field1,Field2,...>');
    }
    const fields = fieldsRaw.split(',').map(f => f.trim()).filter(f => f.length > 0);
    if (fields.length === 0) {
        throw new Error('Argument --fields must contain at least one field name');
    }

    const outDir = readFlag(argv, 'out');
    if (!outDir) {
        throw new Error('Missing required argument: --out <dir>');
    }

    const duplicates = Number.parseInt(readFlag(argv, 'duplicates') ?? '80', 10);
    const newCount = Number.parseInt(readFlag(argv, 'new') ?? '80', 10);
    const seed = Number.parseInt(readFlag(argv, 'seed') ?? String(DECISION_EVAL_SEED), 10);
    const modelName = readFlag(argv, 'model') ?? null;
    const dryRun = argv.includes('--dry-run');

    return {
        Entity: entity,
        Fields: fields,
        OutDir: resolve(outDir),
        Duplicates: duplicates,
        New: newCount,
        Seed: seed,
        ModelName: modelName,
        DryRun: dryRun,
    };
}

/** How the generator calls a model: its driver class and API name, through one vendor. */
interface GenerationRoute {
    ModelName: string;
    DriverClass: string;
    APIName: string;
}

/**
 * The model to generate with, called through the first of its active vendors (by priority) whose
 * driver has an API key, then its default vendor. A model is often served by several vendors, and the
 * key may be for any one of them. A named model with no keyed vendor keeps its default route, so the
 * missing key is reported by name; with no name, the first active LLM with a keyed route is used.
 */
function resolveGenerationRoute(models: readonly MJAIModelEntityExtended[], name: string | null): GenerationRoute {
    const usable = models.filter(m => m.IsActive && !!m.DriverClass && !!m.APIName);
    if (name) {
        const target = name.trim().toLowerCase();
        const named = usable.find(m => m.Name.trim().toLowerCase() === target || m.APIName?.toLowerCase() === target);
        if (!named) {
            throw new Error(`Specified model "${name}" was not found or lacks a driver class and API name.`);
        }
        return keyedRoute(named) ?? { ModelName: named.Name, DriverClass: named.DriverClass ?? '', APIName: named.APIName ?? '' };
    }
    for (const model of usable.filter(m => m.AIModelType.trim().toLowerCase() === 'llm')) {
        const route = keyedRoute(model);
        if (route) return route;
    }
    throw new Error('No active LLM has an API key configured: set AI_VENDOR_API_KEY__<DriverClass> in .env, or pass --model.');
}

/** The model through its first active vendor (by priority), then its default, whose driver has a key. */
function keyedRoute(model: MJAIModelEntityExtended): GenerationRoute | undefined {
    const vendors = [...(model.ModelVendors ?? [])]
        .filter(v => v.Status === 'Active' && !!v.DriverClass)
        .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0))
        .map(v => ({ DriverClass: v.DriverClass ?? '', APIName: v.APIName || model.APIName || '' }));
    const routes = [...vendors, { DriverClass: model.DriverClass ?? '', APIName: model.APIName ?? '' }];
    const route = routes.find(r => !!r.DriverClass && !!r.APIName && !!GetAIAPIKey(r.DriverClass));
    return route ? { ModelName: model.Name, ...route } : undefined;
}

async function main(): Promise<void> {
    const options = parseCliArgs(process.argv.slice(2));

    // Verify output destination path safety
    AssertOutputOutsideRepo(options.OutDir);

    if (options.DryRun) {
        console.log('=== Duplicate Corpus Generation Plan (Dry Run) ===');
        console.log(`Target Entity:     ${options.Entity}`);
        console.log(`Target Fields:     ${options.Fields.join(', ')}`);
        console.log(`Output Directory:  ${options.OutDir}`);
        console.log(`Duplicates Count:  ${options.Duplicates}`);
        console.log(`New (Negatives):   ${options.New}`);
        console.log(`Total Records:     ${options.Duplicates + options.New}`);
        console.log(`PRNG Seed:         ${options.Seed}`);
        console.log(`Model Preference:  ${options.ModelName ?? '(Auto-detect active LLM with API key)'}`);
        console.log('');
        console.log('Estimated Token Usage: ~160,000 tokens across generation prompts.');
        console.log('Dry run complete. No database queries or model calls were executed.');
        return;
    }

    LoadEnv();
    console.log(`Bootstrapping AI stack and connecting to database for entity "${options.Entity}"...`);
    const ctx = await BootstrapAI();

    // 1. Fetch source rows for the target entity
    console.log(`Querying existing rows for "${options.Entity}" with fields: ID, ${options.Fields.join(', ')}...`);
    const runView = new RunView();
    const viewResult = await runView.RunView<Record<string, unknown>>(
        {
            EntityName: options.Entity,
            Fields: ['ID', ...options.Fields],
            ResultType: 'simple',
            BypassCache: true,
            MaxRows: 10000,
        },
        ctx.user
    );

    if (!viewResult.Success) {
        throw new Error(`Failed to query rows for "${options.Entity}": ${viewResult.ErrorMessage}`);
    }

    const sourceRows = viewResult.Results;
    if (sourceRows.length === 0) {
        throw new Error(`Entity "${options.Entity}" has 0 rows. Cannot generate duplicate corpus.`);
    }
    console.log(`Found ${sourceRows.length} source rows in "${options.Entity}".`);

    // 2. Resolve LLM driver: the model through the first of its active vendors whose driver has a key
    const route = resolveGenerationRoute(AIEngine.Instance.Models, options.ModelName);
    const apiKey = GetAIAPIKey(route.DriverClass);
    if (!apiKey) {
        throw new Error(`No API key configured for model "${route.ModelName}" (${route.DriverClass}). Set AI_VENDOR_API_KEY__${route.DriverClass} in .env`);
    }
    console.log(`Using model: ${route.ModelName} (${route.APIName}) with driver ${route.DriverClass}`);
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, route.DriverClass, apiKey);
    if (!driver) {
        throw new Error(`Driver class "${route.DriverClass}" could not be instantiated.`);
    }

    // 3. Seeded sampling of source rows
    const prng = CreateSeededRandom(options.Seed);
    const dupeSources = SampleSourceRecords(sourceRows, options.Duplicates, prng);
    const newSources = SampleSourceRecords(sourceRows, options.New, prng);

    const records: CorpusRecord[] = [];
    const labels: (DuplicateCorpusLabel | NewCorpusLabel)[] = [];

    // Helper for executing generation prompt with retry
    async function generateRecordValues(
        systemPrompt: string,
        userPrompt: string,
        maxRetries: number = 2
    ): Promise<Record<string, string>> {
        let lastError: string | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const params = new ChatParams();
            params.model = route.APIName;
            params.messages = [
                { role: ChatMessageRole.system, content: systemPrompt },
                { role: ChatMessageRole.user, content: userPrompt },
            ];
            params.temperature = 0.7;

            const chatRes = await driver!.ChatCompletion(params);
            const content =
                chatRes.data?.choices?.[0]?.message?.content ??
                '';

            const validation = ValidateGeneratorReply(content, options.Fields);
            if (!validation.Success || !validation.Values) {
                lastError = validation.Error ?? 'Failed reply validation';
                continue;
            }

            // Only an exact match is screened out. A hard negative ("the same operation for a different
            // vendor") may already exist under other wording; the measurement report notes that caveat.
            if (IsExactMatchWithExisting(validation.Values, sourceRows, options.Fields)) {
                lastError = 'Generated record is an exact match with an existing row';
                continue;
            }

            return validation.Values;
        }

        throw new Error(`Generation failed after ${maxRetries + 1} attempts: ${lastError}`);
    }

    // 4. Generate duplicates
    console.log(`Generating ${options.Duplicates} duplicate records...`);
    for (let i = 0; i < dupeSources.length; i++) {
        const sourceRow = dupeSources[i];
        const sourceId = String(sourceRow.ID);
        const userPrompt = BuildDuplicateUserPrompt(options.Entity, sourceRow, options.Fields);
        const values = await generateRecordValues(DUPLICATE_GENERATION_SYSTEM_PROMPT, userPrompt);

        const recordId = randomUUID();
        records.push({ Id: recordId, Values: values });
        labels.push({ Id: recordId, Label: 'duplicate', SourceRecordId: sourceId });

        if ((i + 1) % 10 === 0 || i + 1 === dupeSources.length) {
            console.log(`  Duplicates generated: ${i + 1} / ${options.Duplicates}`);
        }
    }

    // 5. Generate hard negatives (new records)
    console.log(`Generating ${options.New} new (hard negative) records...`);
    for (let i = 0; i < newSources.length; i++) {
        const sourceRow = newSources[i];
        const nearId = String(sourceRow.ID);
        const userPrompt = BuildHardNegativeUserPrompt(options.Entity, sourceRow, options.Fields);
        const values = await generateRecordValues(HARD_NEGATIVE_GENERATION_SYSTEM_PROMPT, userPrompt);

        const recordId = randomUUID();
        records.push({ Id: recordId, Values: values });
        labels.push({ Id: recordId, Label: 'new', NearRecordId: nearId });

        if ((i + 1) % 10 === 0 || i + 1 === newSources.length) {
            console.log(`  New records generated: ${i + 1} / ${options.New}`);
        }
    }

    // 6. Write corpus files
    const metadata: GeneratedFromMetadata = {
        Entity: options.Entity,
        Fields: options.Fields,
        Model: route.ModelName,
        Seed: options.Seed,
        Counts: { Duplicates: options.Duplicates, New: options.New },
        Timestamp: new Date().toISOString(),
    };

    console.log(`Writing corpus files to ${options.OutDir}...`);
    WriteCorpusFiles(options.OutDir, records, labels, metadata);
    console.log(`✔ Generated ${records.length} corpus records (${options.Duplicates} duplicates, ${options.New} new) in ${options.OutDir}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
