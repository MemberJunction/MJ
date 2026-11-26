/**
 * @fileoverview The 9 standard Guided Tour step types (§5.3):
 * Spotlight, Action, Beacon, Modal, Banner, Choice, Media, EmbeddedComponent, AskAgent.
 * @module @memberjunction/tours-runtime
 */

import { RegisterClass } from '@memberjunction/global';
import type { TourCapabilityRequirement } from '../host-contracts';
import type {
    IActionStepConfig,
    IAskAgentStepConfig,
    IBannerStepConfig,
    IBeaconStepConfig,
    IChoiceStepConfig,
    IEmbeddedComponentStepConfig,
    IMediaStepConfig,
    IModalStepConfig,
    ISpotlightStepConfig,
    ITourAnchor,
    ITourCompletion,
    TourHealthCheck,
    TourValidationIssue,
    TourValidationResult,
} from '../types';
import { BaseTourStepType } from './base-step-type';
import type { TourStepAgentBrief, TourStepContext } from './plugin-types';

const INTERACTIVE_ACTION_CHECKS = new Set([
    'Signal',
    'EntityEvent',
    'FieldState',
    'Navigation',
    'AnchorInteraction',
    'All',
    'Any',
]);

@RegisterClass(BaseTourStepType, 'Spotlight')
export class SpotlightStepType extends BaseTourStepType<ISpotlightStepConfig> {
    public ValidateConfig(config: ISpotlightStepConfig): TourValidationResult {
        const warnings: TourValidationIssue[] = [];
        if (config.ExtraAnchors) {
            for (const anchor of config.ExtraAnchors) {
                if (anchor.Strategy === 'Selector') {
                    warnings.push({
                        Code: 'SELECTOR_FALLBACK',
                        Message: 'ExtraAnchor uses CSS Selector strategy; prefer Registered or Semantic anchors.',
                        Field: 'ExtraAnchors',
                        Severity: 'Warning',
                    });
                }
            }
        }
        return this.buildValidationResult([], warnings);
    }

    public override GetTargets(ctx: TourStepContext<ISpotlightStepConfig>): ITourAnchor[] {
        const primary = super.GetTargets(ctx);
        const extras = ctx.Config.ExtraAnchors ?? [];
        return [...primary, ...extras];
    }

    public override GetDefaultCompletion(_ctx: TourStepContext<ISpotlightStepConfig>): ITourCompletion {
        return { Checks: [{ Type: 'NextButton' }], Match: 'All' };
    }

    public override GetHealthChecks(config: ISpotlightStepConfig): TourHealthCheck[] {
        return (config.ExtraAnchors ?? []).map((anchor) => ({
            Kind: 'Anchor',
            Description: `Verify extra spotlight anchor (${anchor.Strategy})`,
            Anchor: anchor,
        }));
    }
}

@RegisterClass(BaseTourStepType, 'Action')
export class ActionStepType extends BaseTourStepType<IActionStepConfig> {
    public ValidateConfig(_config: IActionStepConfig): TourValidationResult {
        return this.buildValidationResult([]);
    }

    public override GetDefaultCompletion(ctx: TourStepContext<IActionStepConfig>): ITourCompletion {
        // Action steps absorb FieldEntry and WaitForSignal; default to AnchorInteraction if an anchor exists.
        if (ctx.Step.Anchor) {
            return {
                Checks: [{ Type: 'AnchorInteraction', Interaction: 'any' }],
                Match: 'All',
            };
        }
        return {
            Checks: [{ Type: 'NextButton' }],
            Match: 'All',
        };
    }

    public override DescribeForAgent(ctx: TourStepContext<IActionStepConfig>): TourStepAgentBrief {
        const base = super.DescribeForAgent(ctx);
        const completion = ctx.Step.Completion ?? this.GetDefaultCompletion(ctx);
        const actionChecks = completion.Checks.filter((c) => INTERACTIVE_ACTION_CHECKS.has(c.Type));
        return {
            ...base,
            ExpectedOutcome:
                actionChecks.length > 0
                    ? `User completes action: ${actionChecks.map((c) => c.Type).join(' / ')}`
                    : base.ExpectedOutcome,
        };
    }
}

@RegisterClass(BaseTourStepType, 'Beacon')
export class BeaconStepType extends BaseTourStepType<IBeaconStepConfig> {
    public ValidateConfig(config: IBeaconStepConfig): TourValidationResult {
        const errors: TourValidationIssue[] = [];
        // WCAG 2.2.2: pulse animation must stop within 5s
        if (typeof config.PulseDurationMs === 'number' && config.PulseDurationMs > 5000) {
            errors.push({
                Code: 'BEACON_PULSE_EXCEEDS_WCAG',
                Message: 'Beacon PulseDurationMs must not exceed 5000ms (WCAG 2.2.2).',
                Field: 'PulseDurationMs',
                Severity: 'Error',
            });
        }
        return this.buildValidationResult(errors);
    }

    public override GetDefaultCompletion(_ctx: TourStepContext<IBeaconStepConfig>): ITourCompletion {
        return {
            Checks: [{ Type: 'AnchorInteraction', Interaction: 'click' }],
            Match: 'Any',
        };
    }
}

@RegisterClass(BaseTourStepType, 'Modal')
export class ModalStepType extends BaseTourStepType<IModalStepConfig> {
    public ValidateConfig(_config: IModalStepConfig): TourValidationResult {
        return this.buildValidationResult([]);
    }

    public override GetTargets(_ctx: TourStepContext<IModalStepConfig>): ITourAnchor[] {
        // Centered modal steps do not require DOM targets.
        return [];
    }

    public override GetDefaultCompletion(_ctx: TourStepContext<IModalStepConfig>): ITourCompletion {
        return { Checks: [{ Type: 'NextButton' }], Match: 'All' };
    }
}

@RegisterClass(BaseTourStepType, 'Banner')
export class BannerStepType extends BaseTourStepType<IBannerStepConfig> {
    public ValidateConfig(_config: IBannerStepConfig): TourValidationResult {
        return this.buildValidationResult([]);
    }

    public override GetTargets(_ctx: TourStepContext<IBannerStepConfig>): ITourAnchor[] {
        return [];
    }

    public override GetDefaultCompletion(ctx: TourStepContext<IBannerStepConfig>): ITourCompletion {
        if (ctx.Config.CtaSignalKey) {
            return {
                Checks: [{ Type: 'Signal', SignalKey: ctx.Config.CtaSignalKey }, { Type: 'NextButton' }],
                Match: 'Any',
            };
        }
        return { Checks: [{ Type: 'NextButton' }], Match: 'All' };
    }
}

@RegisterClass(BaseTourStepType, 'Choice')
export class ChoiceStepType extends BaseTourStepType<IChoiceStepConfig> {
    public ValidateConfig(config: IChoiceStepConfig): TourValidationResult {
        const errors: TourValidationIssue[] = [];
        const options = config.Options ?? [];
        if (options.length < 2 || options.length > 4) {
            errors.push({
                Code: 'CHOICE_OPTION_COUNT',
                Message: 'Choice step must define between 2 and 4 options.',
                Field: 'Options',
                Severity: 'Error',
            });
        }
        const keys = new Set<string>();
        for (const opt of options) {
            if (!opt.Key?.trim()) {
                errors.push({
                    Code: 'CHOICE_OPTION_MISSING_KEY',
                    Message: 'Every choice option must have a non-empty Key.',
                    Field: 'Options',
                    Severity: 'Error',
                });
            } else if (keys.has(opt.Key)) {
                errors.push({
                    Code: 'CHOICE_OPTION_DUPLICATE_KEY',
                    Message: `Duplicate choice option Key '${opt.Key}'.`,
                    Field: 'Options',
                    Severity: 'Error',
                });
            }
            keys.add(opt.Key);
        }
        return this.buildValidationResult(errors);
    }

    public override GetDefaultCompletion(_ctx: TourStepContext<IChoiceStepConfig>): ITourCompletion {
        return { Checks: [{ Type: 'NextButton' }], Match: 'All' };
    }

    public override DescribeForAgent(ctx: TourStepContext<IChoiceStepConfig>): TourStepAgentBrief {
        const base = super.DescribeForAgent(ctx);
        const optionsSummary = (ctx.Config.Options ?? []).map((o) => `${o.Key}: ${o.Label}`).join('; ');
        return {
            ...base,
            ExpectedOutcome: `User picks one choice (${optionsSummary})`,
            StepTools: [
                {
                    Name: 'TourSelectChoice',
                    Description: 'Select one of the authored choices on the current Choice step.',
                    InputSchema: {
                        type: 'object',
                        properties: {
                            ChoiceKey: {
                                type: 'string',
                                enum: (ctx.Config.Options ?? []).map((o) => o.Key),
                            },
                        },
                        required: ['ChoiceKey'],
                    },
                },
            ],
        };
    }
}

@RegisterClass(BaseTourStepType, 'Media')
export class MediaStepType extends BaseTourStepType<IMediaStepConfig> {
    public ValidateConfig(config: IMediaStepConfig): TourValidationResult {
        const errors: TourValidationIssue[] = [];
        if (!config.SourceUrl?.trim()) {
            errors.push({
                Code: 'MEDIA_MISSING_SOURCE',
                Message: 'Media step requires SourceUrl.',
                Field: 'SourceUrl',
                Severity: 'Error',
            });
        }
        if (!config.AltText?.trim()) {
            errors.push({
                Code: 'MEDIA_MISSING_ALT_TEXT',
                Message: 'Media step requires AltText for WCAG accessibility.',
                Field: 'AltText',
                Severity: 'Error',
            });
        }
        if (config.MediaType === 'video' && !config.CaptionsUrl?.trim()) {
            errors.push({
                Code: 'MEDIA_VIDEO_MISSING_CAPTIONS',
                Message: 'Video media steps require CaptionsUrl (WCAG 1.2.2).',
                Field: 'CaptionsUrl',
                Severity: 'Error',
            });
        }
        return this.buildValidationResult(errors);
    }

    public override GetDefaultCompletion(ctx: TourStepContext<IMediaStepConfig>): ITourCompletion {
        if (ctx.Config.AutoAdvanceOnEnd) {
            return {
                Checks: [{ Type: 'Signal', SignalKey: `tours.media.ended.${ctx.Step.StepKey}` }, { Type: 'NextButton' }],
                Match: 'Any',
            };
        }
        return { Checks: [{ Type: 'NextButton' }], Match: 'All' };
    }
}

@RegisterClass(BaseTourStepType, 'EmbeddedComponent')
export class EmbeddedComponentStepType extends BaseTourStepType<IEmbeddedComponentStepConfig> {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        Angular: true,
    };

    public ValidateConfig(config: IEmbeddedComponentStepConfig): TourValidationResult {
        const errors: TourValidationIssue[] = [];
        if (!config.ComponentID && !config.ComponentName && !config.ComponentSpec) {
            errors.push({
                Code: 'EMBEDDED_COMPONENT_MISSING_TARGET',
                Message: 'EmbeddedComponent step requires ComponentID, ComponentName, or ComponentSpec.',
                Field: 'ComponentID',
                Severity: 'Error',
            });
        }
        return this.buildValidationResult(errors);
    }

    public override GetDefaultCompletion(ctx: TourStepContext<IEmbeddedComponentStepConfig>): ITourCompletion {
        const eventName = ctx.Config.CompletionEventName ?? `tours.component.completed.${ctx.Step.StepKey}`;
        if (ctx.Config.AllowNextButtonFallback !== false) {
            return {
                Checks: [{ Type: 'Signal', SignalKey: eventName }, { Type: 'NextButton' }],
                Match: 'Any',
            };
        }
        return {
            Checks: [{ Type: 'Signal', SignalKey: eventName }],
            Match: 'All',
        };
    }

    public override GetHealthChecks(config: IEmbeddedComponentStepConfig): TourHealthCheck[] {
        return [
            {
                Kind: 'Config',
                Description: `Verify embedded component '${config.ComponentName ?? config.ComponentID ?? 'inline-spec'}'`,
                StepType: 'EmbeddedComponent',
            },
        ];
    }
}

@RegisterClass(BaseTourStepType, 'AskAgent')
export class AskAgentStepType extends BaseTourStepType<IAskAgentStepConfig> {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        Agent: ['Chat', 'Voice', 'Chat and Voice'],
    };

    public ValidateConfig(config: IAskAgentStepConfig): TourValidationResult {
        const errors: TourValidationIssue[] = [];
        if (!config.SeedPrompt?.trim()) {
            errors.push({
                Code: 'ASK_AGENT_MISSING_PROMPT',
                Message: 'AskAgent step requires SeedPrompt.',
                Field: 'SeedPrompt',
                Severity: 'Error',
            });
        }
        return this.buildValidationResult(errors);
    }

    public override GetDefaultCompletion(ctx: TourStepContext<IAskAgentStepConfig>): ITourCompletion {
        if (ctx.Config.AllowNextButtonFallback !== false) {
            return {
                Checks: [{ Type: 'AgentConfirmed' }, { Type: 'NextButton' }],
                Match: 'Any',
            };
        }
        return {
            Checks: [{ Type: 'AgentConfirmed' }],
            Match: 'All',
        };
    }

    public override DescribeForAgent(ctx: TourStepContext<IAskAgentStepConfig>): TourStepAgentBrief {
        const base = super.DescribeForAgent(ctx);
        return {
            ...base,
            Instructions: `${base.Instructions}\nSeed prompt: ${ctx.Config.SeedPrompt}`,
            StepTools: [
                {
                    Name: 'TourConfirmAskAgentStep',
                    Description: 'Confirm the user has completed the AskAgent step conversation.',
                    InputSchema: {
                        type: 'object',
                        properties: {
                            Summary: { type: 'string' },
                        },
                    },
                },
            ],
        };
    }
}
