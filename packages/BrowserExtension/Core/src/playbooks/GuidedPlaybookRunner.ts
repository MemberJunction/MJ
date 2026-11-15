/**
 * @fileoverview `GuidedPlaybookRunner` — Executes Guided Cross-Site Admin Playbooks in the
 * MemberJunction Browser Extension.
 *
 * Capabilities:
 * - **Pre-Execution Confirmation Gate:** Requires explicit user approval before executing any
 *   DOM-mutating step (`ClickElement`, `FillInput`, `Navigate`) unless `AutoApproveDomMutations`
 *   is enabled for the session.
 * - **Coach-Mark Spotlight Visual Guidance:** Draws pulsing spotlight rings around target DOM
 *   elements (`HighlightElement`) and waits for user actions (`WaitForUserAction`).
 * - **Self-Healing DOM Replay:** Passes `ExpectedFingerprint` to the browser control adapter so
 *   `ReresolveTarget` + `ShouldAcceptHeal` automatically recover when third-party admin portals
 *   change CSS classes or DOM hierarchy.
 * - **Model-Blind Secret Vault Pipe:** Executes `CopySecretToMJVault` steps via
 *   {@link ModelBlindSecretVaultPipe} so OAuth client secrets never enter LLM context.
 *
 * @module @memberjunction/browser-extension-core
 */

import type {
    BrowserPlaybookDefinition,
    BrowserPlaybookStep,
    BrowserPlaybookStepOutcome,
    IBrowserControlAdapter,
} from '../types/extension-types.js';
import type { IPlaybookStepExecutor } from '../channel/LocalBrowserChannel.js';
import { ModelBlindSecretVaultPipe } from './ModelBlindSecretVaultPipe.js';
import { REFERENCE_BROWSER_PLAYBOOKS } from './ReferencePlaybooks.js';

/**
 * Callback invoked when a DOM-mutating step requires user confirmation before execution.
 */
export type PlaybookStepConfirmationGate = (
    playbook: BrowserPlaybookDefinition,
    step: BrowserPlaybookStep
) => Promise<boolean>;

/**
 * Executes Guided Cross-Site Playbooks with Coach-Mark Spotlight overlays, DOM healing,
 * and Model-Blind Secret Vaulting.
 */
export class GuidedPlaybookRunner implements IPlaybookStepExecutor {
    private readonly adapter: IBrowserControlAdapter;
    private readonly secretVaultPipe?: ModelBlindSecretVaultPipe;
    private readonly playbooks = new Map<string, BrowserPlaybookDefinition>();
    private confirmationGate?: PlaybookStepConfirmationGate;
    private autoApproveDomMutations = false;

    public constructor(options: {
        Adapter: IBrowserControlAdapter;
        SecretVaultPipe?: ModelBlindSecretVaultPipe;
        Playbooks?: BrowserPlaybookDefinition[];
        ConfirmationGate?: PlaybookStepConfirmationGate;
        AutoApproveDomMutations?: boolean;
    }) {
        this.adapter = options.Adapter;
        this.secretVaultPipe = options.SecretVaultPipe;
        this.confirmationGate = options.ConfirmationGate;
        this.autoApproveDomMutations = options.AutoApproveDomMutations ?? false;

        for (const pb of options.Playbooks ?? REFERENCE_BROWSER_PLAYBOOKS) {
            this.playbooks.set(pb.Id, pb);
        }
    }

    /**
     * Registers or updates a playbook definition.
     */
    public RegisterPlaybook(playbook: BrowserPlaybookDefinition): void {
        this.playbooks.set(playbook.Id, playbook);
    }

    /**
     * Retrieves a registered playbook by ID.
     */
    public GetPlaybook(playbookId: string): BrowserPlaybookDefinition | undefined {
        return this.playbooks.get(playbookId);
    }

    /**
     * Lists all registered playbooks.
     */
    public ListPlaybooks(): BrowserPlaybookDefinition[] {
        return Array.from(this.playbooks.values());
    }

    /**
     * Sets or replaces the Pre-Execution Confirmation Gate callback.
     */
    public SetConfirmationGate(gate: PlaybookStepConfirmationGate | undefined): void {
        this.confirmationGate = gate;
    }

    /**
     * Sets whether DOM-mutating steps (`ClickElement`, `FillInput`, `Navigate`) auto-approve.
     */
    public SetAutoApproveDomMutations(autoApprove: boolean): void {
        this.autoApproveDomMutations = autoApprove;
    }

    /**
     * Executes a single playbook step by `playbookId` and `stepId` (implementing {@link IPlaybookStepExecutor}).
     */
    public async ExecuteStepById(
        playbookId: string,
        stepId: string
    ): Promise<BrowserPlaybookStepOutcome> {
        const playbook = this.playbooks.get(playbookId);
        if (!playbook) {
            return {
                StepId: stepId,
                Kind: 'HighlightElement',
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorMessage: `Playbook "${playbookId}" is not registered.`,
            };
        }

        const stepIndex = playbook.Steps.findIndex((s) => s.StepId === stepId);
        if (stepIndex === -1) {
            return {
                StepId: stepId,
                Kind: 'HighlightElement',
                Success: false,
                BackendUsed: 'content-script',
                EscalatedToDebugger: false,
                ErrorMessage: `Step "${stepId}" not found in playbook "${playbookId}".`,
            };
        }

        return this.ExecuteStep(playbook, playbook.Steps[stepIndex], stepIndex + 1);
    }

    /**
     * Executes a single {@link BrowserPlaybookStep}.
     */
    public async ExecuteStep(
        playbook: BrowserPlaybookDefinition,
        step: BrowserPlaybookStep,
        stepNumber = 1
    ): Promise<BrowserPlaybookStepOutcome> {
        // Enforce Pre-Execution Confirmation Gate on DOM-mutating steps
        if (this.requiresConfirmation(step.Kind) && !this.autoApproveDomMutations && this.confirmationGate) {
            const approved = await this.confirmationGate(playbook, step);
            if (!approved) {
                return {
                    StepId: step.StepId,
                    Kind: step.Kind,
                    Success: false,
                    BackendUsed: 'content-script',
                    EscalatedToDebugger: false,
                    ErrorMessage: `User declined execution of step "${step.Title}".`,
                };
            }
        }

        switch (step.Kind) {
            case 'Navigate': {
                const url = step.NavigateUrl ?? playbook.StartUrl ?? '';
                const res = await this.adapter.Navigate(url);
                return {
                    StepId: step.StepId,
                    Kind: step.Kind,
                    Success: res.Success,
                    BackendUsed: res.BackendUsed,
                    EscalatedToDebugger: res.EscalatedToDebugger,
                    ErrorMessage: res.ErrorMessage,
                };
            }

            case 'HighlightElement': {
                const res = await this.adapter.HighlightElement({
                    Selector: step.TargetSelector,
                    Label: step.Instruction,
                    StepBadge: `Step ${stepNumber} of ${playbook.Steps.length}`,
                    CalloutPosition: step.CalloutPosition ?? 'auto',
                });
                return {
                    StepId: step.StepId,
                    Kind: step.Kind,
                    Success: res.Success,
                    BackendUsed: res.BackendUsed,
                    EscalatedToDebugger: res.EscalatedToDebugger,
                    ErrorMessage: res.ErrorMessage,
                };
            }

            case 'WaitForUserAction': {
                const res = await this.adapter.WaitForUserAction({
                    ActionKind: step.WaitForActionKind ?? 'click',
                    Selector: step.TargetSelector,
                    UrlPattern: step.ExpectedUrlPattern,
                });
                return {
                    StepId: step.StepId,
                    Kind: step.Kind,
                    Success: res.Success,
                    BackendUsed: res.BackendUsed,
                    EscalatedToDebugger: res.EscalatedToDebugger,
                    ErrorMessage: res.ErrorMessage,
                };
            }

            case 'ClickElement': {
                const res = await this.adapter.ClickElement({
                    Selector: step.TargetSelector,
                    ExpectedFingerprint: step.ExpectedFingerprint,
                    RequireTrustedInput: step.RequireTrustedInput,
                });
                return {
                    StepId: step.StepId,
                    Kind: step.Kind,
                    Success: res.Success,
                    BackendUsed: res.BackendUsed,
                    EscalatedToDebugger: res.EscalatedToDebugger,
                    HealedSelector: res.Data?.Healed ? res.Data?.Selector : undefined,
                    ErrorMessage: res.ErrorMessage,
                };
            }

            case 'FillInput': {
                const res = await this.adapter.FillInput({
                    Selector: step.TargetSelector,
                    Value: step.InputValue ?? '',
                    ExpectedFingerprint: step.ExpectedFingerprint,
                    RequireTrustedInput: step.RequireTrustedInput,
                });
                return {
                    StepId: step.StepId,
                    Kind: step.Kind,
                    Success: res.Success,
                    BackendUsed: res.BackendUsed,
                    EscalatedToDebugger: res.EscalatedToDebugger,
                    HealedSelector: res.Data?.Healed ? res.Data?.Selector : undefined,
                    ErrorMessage: res.ErrorMessage,
                };
            }

            case 'CopySecretToMJVault': {
                if (!this.secretVaultPipe) {
                    return {
                        StepId: step.StepId,
                        Kind: step.Kind,
                        Success: false,
                        BackendUsed: 'content-script',
                        EscalatedToDebugger: false,
                        ErrorMessage: 'ModelBlindSecretVaultPipe is not configured on GuidedPlaybookRunner.',
                    };
                }
                const vaultRes = await this.secretVaultPipe.CopySecretToMJVault({
                    SourceSelector: step.TargetSelector ?? '',
                    VaultCredentialName: step.VaultCredentialName ?? playbook.Name,
                    VaultTargetFieldName: step.VaultTargetFieldName ?? 'ClientSecret',
                });
                return {
                    StepId: step.StepId,
                    Kind: step.Kind,
                    Success: vaultRes.Success,
                    BackendUsed: 'content-script',
                    EscalatedToDebugger: false,
                    VaultedFieldName: vaultRes.Success ? vaultRes.VaultTargetFieldName : undefined,
                    ErrorMessage: vaultRes.ErrorMessage,
                };
            }
        }
    }

    private requiresConfirmation(kind: BrowserPlaybookStep['Kind']): boolean {
        return kind === 'ClickElement' || kind === 'FillInput' || kind === 'Navigate';
    }
}
