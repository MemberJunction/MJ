/**
 * set-prompt-preference.ts — sets or clears `PromptConfiguration.LLM.UseNativeToolCalling` on ONE prompt through
 * the entity layer (BaseEntity.Save), for prompts that exist only in the database and so are out of reach of
 * `mj sync push` (see native-posture.cjs).
 *
 *   npx tsx rigs/set-prompt-preference.ts --prompt "<name>" --value true|false|null
 */
import { RunView } from '@memberjunction/core';
import type { MJAIPromptEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { bootstrapAI } from './lib/ai-bootstrap';

const arg = (name: string): string | undefined => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};

(async () => {
    const promptName = arg('prompt');
    const value = arg('value');
    if (!promptName || !value || !['true', 'false', 'null'].includes(value)) {
        console.error('usage: --prompt <name> --value true|false|null');
        process.exit(2);
    }
    const ctx = await bootstrapAI();
    const rv = new RunView(ctx.provider);
    const result = await rv.RunView<MJAIPromptEntity>({
        EntityName: 'MJ: AI Prompts',
        ExtraFilter: `Name = '${EscapeSQLString(promptName)}'`,
        ResultType: 'entity_object'
    }, ctx.user);
    if (!result.Success || result.Results.length !== 1) {
        console.error(`expected exactly one prompt named "${promptName}", got ${result.Results?.length ?? 'error'}: ${result.ErrorMessage ?? ''}`);
        process.exit(1);
    }
    const prompt = result.Results[0];
    let cfg: Record<string, unknown> = {};
    try { cfg = prompt.PromptConfiguration ? JSON.parse(prompt.PromptConfiguration) as Record<string, unknown> : {}; } catch { cfg = {}; }
    const llm = ((cfg.LLM as Record<string, unknown> | undefined) ?? {});
    if (value === 'null') { delete llm.UseNativeToolCalling; } else { llm.UseNativeToolCalling = value === 'true'; }
    if (Object.keys(llm).length > 0) { cfg.LLM = llm; } else { delete cfg.LLM; }
    prompt.PromptConfiguration = Object.keys(cfg).length > 0 ? JSON.stringify(cfg) : null;
    const ok = await prompt.Save();
    if (!ok) {
        console.error(`save failed: ${prompt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        process.exit(1);
    }
    console.log(`"${promptName}" PromptConfiguration → ${prompt.PromptConfiguration}`);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
