import { SaveTimeAISettings } from '@memberjunction/ai';
import type { SaveTimeAIConfig } from '@memberjunction/ai';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationTier, IntegrationTierScope, IntegrationTierScopeExit } from '@memberjunction/testing-integration';

/**
 * Host-level switch for the in-process side of the deterministic tier: while the
 * IntegrationTestDriver runs a test of a credential-free tier, every save-time AI prompt
 * (`SaveTimeAISettings.PromptKinds`: query and template parameter enrichment, view smart filters,
 * code generation) is off for every save this process executes, including saves made by engines
 * that give the test no entity handle (the metadata-sync push, record cloning). Save-time
 * embeddings stay as the host has them: they run a local, in-process model that needs no
 * credentials and writes no AI Prompt Run, and checks of this tier verify the stored vectors.
 *
 * The switch is a tier scope, not a module-load side effect: `mj test` loads this module for every
 * run (mj.config.cjs `testing.checkModules`), so setting it at load would also switch the prompts
 * off for the live-model suite and every other test type. Outside a matching test the settings are
 * exactly what they were before.
 *
 * Bound tiers: 'deterministic' and 'mutation'. Both are credential-free (tiers.ts) and both run
 * in the "Integration Tests — Deterministic" suite (IT91 and IT94 are mutation-tier members; IT94
 * creates queries and template contents through the sync engine). 'live-model' is excluded.
 *
 * The switch is process-global (see tier-scope.ts): a parallel suite run mixing live-model and
 * deterministic tests sees it off for all of them while any deterministic test is in flight.
 *
 * Per-instance `SkipAIEnrichment` flags (checks/deterministic-entity-factory.ts) cover the checks that do
 * hold the entity. Saves executed inside a separate MJAPI need the equivalent `saveTimeAI`
 * section in that server's config.
 */
export const DETERMINISTIC_SAVE_TIME_AI_SCOPE_NAME = 'deterministic-save-time-ai-prompts-off';

/** The tiers during which save-time AI prompts are off in this process. */
export const DETERMINISTIC_SAVE_TIME_AI_TIERS: readonly IntegrationTier[] = ['deterministic', 'mutation'];

/**
 * Reference-counted scope: nested or overlapping Enter calls (two tests of the same process) share
 * one installed config, and only the outermost exit restores the config that was there before.
 */
class DeterministicSaveTimeAIScope implements IntegrationTierScope {
    public readonly Name = DETERMINISTIC_SAVE_TIME_AI_SCOPE_NAME;
    public readonly Tiers = DETERMINISTIC_SAVE_TIME_AI_TIERS;
    private depth = 0;
    private saved: Readonly<SaveTimeAIConfig> | null = null;

    public Enter(): IntegrationTierScopeExit {
        const settings = SaveTimeAISettings.Instance;
        if (this.depth === 0) {
            this.saved = settings.Config;
            settings.Config = SaveTimeAISettings.WithPromptsDisabled(this.saved);
        }
        this.depth++;
        let exited = false;
        return () => {
            if (exited) {
                return;
            }
            exited = true;
            this.depth--;
            if (this.depth === 0) {
                settings.Config = this.saved || {};
                this.saved = null;
            }
        };
    }
}

IntegrationCheckRegistry.Instance.RegisterTierScope(new DeterministicSaveTimeAIScope());
