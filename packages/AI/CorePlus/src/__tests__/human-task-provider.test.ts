import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
    BaseHumanTaskProvider,
    CanHumanTaskProviderBeDefault,
    DefaultHumanTaskProviderRefusal,
    HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT,
    HumanTaskProviderDefaults,
    HumanTaskRaiseResult,
    IsHumanTaskProviderRegistered,
    ResolveHumanStepProvider,
    ResolveHumanTaskProvider,
    SameHumanTaskProvider,
} from '../human-task-provider';

class EligibleProvider extends BaseHumanTaskProvider {
    public async RaiseTask(): Promise<HumanTaskRaiseResult> {
        return { Outcome: 'raised' };
    }
}

class NamedOnlyProvider extends BaseHumanTaskProvider {
    public async RaiseTask(): Promise<HumanTaskRaiseResult> {
        return { Outcome: 'raised' };
    }
}

const factory = MJGlobal.Instance.ClassFactory;
factory.Register(BaseHumanTaskProvider, EligibleProvider, 'HTP-Test-Eligible', 0, false, false, { [HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT]: true });
factory.Register(BaseHumanTaskProvider, NamedOnlyProvider, 'HTP-Test-NamedOnly');

describe('human-task provider registry lookups', () => {
    it('resolves a provider by its exact key, ignoring case and surrounding space', () => {
        expect(ResolveHumanTaskProvider(' htp-test-eligible ')).toBeInstanceOf(EligibleProvider);
        expect(IsHumanTaskProviderRegistered('HTP-Test-NamedOnly')).toBe(true);
    });

    it('never falls back to the abstract base for an unknown key', () => {
        expect(ResolveHumanTaskProvider('HTP-Test-Missing')).toBeNull();
        expect(IsHumanTaskProviderRegistered('HTP-Test-Missing')).toBe(false);
        expect(IsHumanTaskProviderRegistered('   ')).toBe(false);
    });

    it('reads CanBeDefault from the registration metadata, and only a literal true counts', () => {
        expect(CanHumanTaskProviderBeDefault('HTP-Test-Eligible')).toBe(true);
        expect(CanHumanTaskProviderBeDefault('HTP-Test-NamedOnly')).toBe(false);
        expect(CanHumanTaskProviderBeDefault('HTP-Test-Missing')).toBe(false);
    });
});

describe('DefaultHumanTaskProviderRefusal', () => {
    it('refuses a provider that is not registered', () => {
        expect(DefaultHumanTaskProviderRefusal('X', false, false)).toMatch(/no human-task provider is registered/);
    });
    it('refuses a registered provider that did not declare CanBeDefault', () => {
        expect(DefaultHumanTaskProviderRefusal('X', true, false)).toMatch(/does not declare CanBeDefault/);
    });
    it('accepts an eligible provider', () => {
        expect(DefaultHumanTaskProviderRefusal('X', true, true)).toBeNull();
    });
});

describe('HumanTaskProviderDefaults', () => {
    const defaults = HumanTaskProviderDefaults.Instance;
    beforeEach(() => defaults.Configure(null));

    it('has no default until one is configured', () => {
        expect(defaults.ConfiguredKey).toBeNull();
        expect(defaults.EffectiveKey).toBeNull();
    });

    it('treats empty and the built-in AgentRequest as no default', () => {
        expect(defaults.Configure('  ')).toBeNull();
        expect(defaults.EffectiveKey).toBeNull();
        expect(defaults.Configure('AgentRequest')).toBeNull();
        expect(defaults.ConfiguredKey).toBeNull();
    });

    it('uses an eligible provider', () => {
        expect(defaults.Configure(' HTP-Test-Eligible ')).toBeNull();
        expect(defaults.EffectiveKey).toBe('HTP-Test-Eligible');
    });

    it('keeps the inbox when the configured provider did not declare CanBeDefault', () => {
        expect(defaults.Configure('HTP-Test-NamedOnly')).toMatch(/CanBeDefault/);
        expect(defaults.ConfiguredKey).toBe('HTP-Test-NamedOnly');
        expect(defaults.EffectiveKey).toBeNull();
    });

    it('keeps the inbox when the configured provider is not registered', () => {
        expect(defaults.Configure('HTP-Test-Missing')).toMatch(/no human-task provider is registered/);
        expect(defaults.EffectiveKey).toBeNull();
    });

    it('takes effect once a provider registers after configuration', () => {
        expect(defaults.Configure('HTP-Test-Late')).not.toBeNull();
        expect(defaults.EffectiveKey).toBeNull();
        class LateProvider extends BaseHumanTaskProvider {
            public async RaiseTask(): Promise<HumanTaskRaiseResult> {
                return { Outcome: 'raised' };
            }
        }
        factory.Register(BaseHumanTaskProvider, LateProvider, 'HTP-Test-Late', 0, false, false, { [HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT]: true });
        expect(defaults.EffectiveKey).toBe('HTP-Test-Late');
    });
});

describe('ResolveHumanStepProvider', () => {
    it('keeps the provider a step names, the built-in one included', () => {
        expect(ResolveHumanStepProvider('Other', 'Default')).toBe('Other');
        expect(ResolveHumanStepProvider('AgentRequest', 'Default')).toBe('AgentRequest');
    });
    it('uses the default for a step that names none', () => {
        expect(ResolveHumanStepProvider(undefined, 'Default')).toBe('Default');
        expect(ResolveHumanStepProvider('  ', 'Default')).toBe('Default');
    });
    it('leaves a step without a provider when there is no default', () => {
        expect(ResolveHumanStepProvider(null, null)).toBeUndefined();
    });
});

describe('SameHumanTaskProvider', () => {
    it('compares keys ignoring case and surrounding space', () => {
        expect(SameHumanTaskProvider(' BizAppsTasks', 'bizappstasks ')).toBe(true);
        expect(SameHumanTaskProvider('A', 'B')).toBe(false);
    });
    it('never matches a missing key', () => {
        expect(SameHumanTaskProvider(null, null)).toBe(false);
        expect(SameHumanTaskProvider('', '')).toBe(false);
    });
});
