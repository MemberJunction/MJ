import { describe, it, expect } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';
import type { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ComputerUseAction } from '../action/ComputerUseAction.js';
import { MJComputerUseEngine } from '../engine/MJComputerUseEngine.js';
import { MJRunComputerUseParams } from '../types/mj-params.js';

/**
 * #4807: the controller, judge and heal prompts a Computer Use action runs must spend the agent run's
 * keys. The action takes the run's `RuntimeAPIKeyResolver` and `CredentialScope`; the engine hands both
 * to every `AIPromptParams` it builds.
 */
class ExposedAction extends ComputerUseAction {
    public Build(params: RunActionParams): MJRunComputerUseParams {
        return this.BuildRunParams(params);
    }
}

class ExposedEngine extends MJComputerUseEngine {
    public Capture(params: MJRunComputerUseParams): void {
        this.CaptureRunCredentials(params);
    }
    public Build(): AIPromptParams {
        return this.BuildPromptParams({ Name: 'Computer Use - Controller' } as unknown as MJAIPromptEntityExtended, {});
    }
}

function actionParams(overrides: Partial<RunActionParams> = {}): RunActionParams {
    return {
        Params: [{ Name: 'Goal', Value: 'Find the pricing page', Type: 'Input' }],
        ...overrides,
    } as RunActionParams;
}

describe('Computer Use runs on the agent run\'s keys', () => {
    it('carries the run\'s resolver and scope from the action to every prompt the engine builds', () => {
        const resolver = (driverClass: string): string | undefined => (driverClass === 'OpenAILLM' ? 'run-key' : undefined);
        const runParams = new ExposedAction().Build(actionParams({ RuntimeAPIKeyResolver: resolver, CredentialScope: 'RuntimeOnly' }));

        expect(runParams.APIKeyResolver).toBe(resolver);
        expect(runParams.CredentialScope).toBe('RuntimeOnly');

        const engine = new ExposedEngine();
        engine.Capture(runParams);
        const promptParams = engine.Build();

        expect(promptParams.APIKeyResolver).toBe(resolver);
        expect(promptParams.APIKeyResolver?.('OpenAILLM')).toBe('run-key');
        expect(promptParams.CredentialScope).toBe('RuntimeOnly');
    });

    it('leaves both unset when the run carries no keys — platform keys as before', () => {
        const runParams = new ExposedAction().Build(actionParams());

        expect(runParams.APIKeyResolver).toBeUndefined();
        expect(runParams.CredentialScope).toBeUndefined();

        const engine = new ExposedEngine();
        engine.Capture(runParams);
        const promptParams = engine.Build();

        expect(promptParams.APIKeyResolver).toBeUndefined();
        expect(promptParams.CredentialScope).toBeUndefined();
    });

    it('does not carry one run\'s keys into the next run on the same engine', () => {
        const engine = new ExposedEngine();
        const first = new MJRunComputerUseParams();
        first.APIKeyResolver = () => 'run-key';
        engine.Capture(first);

        engine.Capture(new MJRunComputerUseParams());

        expect(engine.Build().APIKeyResolver).toBeUndefined();
    });
});
