import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
    BuildPolicyDraftFromEntity,
    CHIEF_OF_STAFF_AGENT_NAME,
    ChiefOfStaffPage,
    PolicyCalendarChannelModeValue,
    PolicyCoordinationModeValue,
    PolicyDataAccessModeValue,
    PolicyEmailChannelModeValue,
    PolicyMessagingChannelModeValue,
    PolicyPhoneChannelModeValue,
    PolicyStatusValue,
} from './chief-of-staff-agent-context';
import { BaseChiefOfStaffPage } from './chief-of-staff-page-base';

/**
 * The Chief of Staff application's Governance page: edits the user's
 * `MJ: AI Agent User Policies` record (autonomy, channels, approval guardrails and standing
 * instructions) as a draft, saved explicitly.
 */
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffGovernance')
@Component({
    standalone: false,
    selector: 'mj-chief-of-staff-governance',
    templateUrl: './chief-of-staff-governance.component.html',
    styleUrls: ['./chief-of-staff-pages.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChiefOfStaffGovernanceComponent extends BaseChiefOfStaffPage {
    protected readonly Page: ChiefOfStaffPage = 'governance';

    public IsSavingPolicy = false;
    public PolicyDirty = false;

    public readonly StatusOptions: readonly PolicyStatusValue[] = ['Active', 'Paused', 'Disabled'];
    public readonly CoordinationModeOptions: readonly {
        Value: PolicyCoordinationModeValue;
        Label: string;
        Description: string;
    }[] = [
        {
            Value: 'Observer',
            Label: 'Observer',
            Description: 'Monitors signals and prepares briefings; never initiates changes.',
        },
        {
            Value: 'Coordinator',
            Label: 'Coordinator',
            Description: 'Tracks priorities, drafts communications, and requests approval before high-impact actions.',
        },
        {
            Value: 'Autonomous',
            Label: 'Autonomous',
            Description: 'Executes within policy guardrails and auto-approval thresholds.',
        },
    ];
    public readonly DataAccessModeOptions: readonly {
        Value: PolicyDataAccessModeValue;
        Label: string;
    }[] = [
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'AllowListOnly', Label: 'Allow-List Only' },
        { Value: 'UserCeiling', Label: 'User Ceiling (Full Delegated Access)' },
    ];
    public readonly EmailChannelOptions: readonly {
        Value: PolicyEmailChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'DraftOnly', Label: 'Draft Only' },
        { Value: 'SendAsAgent', Label: 'Send as Chief of Staff' },
        { Value: 'SendAsUser', Label: 'Send on Behalf of User' },
    ];
    public readonly CalendarChannelOptions: readonly {
        Value: PolicyCalendarChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'ProposeWithApproval', Label: 'Propose with Approval' },
        { Value: 'Autonomous', Label: 'Autonomous Scheduling' },
    ];
    public readonly PhoneChannelOptions: readonly {
        Value: PolicyPhoneChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'InboundOnly', Label: 'Inbound Only' },
        { Value: 'OutboundWithApproval', Label: 'Outbound with Approval' },
        { Value: 'OutboundAutonomous', Label: 'Outbound Autonomous' },
    ];
    public readonly MessagingChannelOptions: readonly {
        Value: PolicyMessagingChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'Enabled', Label: 'Enabled' },
    ];

    /** A reload replaces the draft with the saved policy. */
    protected override OnDataLoaded(): void {
        this.PolicyDirty = false;
    }

    public OpenPolicyEntityRecord(): void {
        if (this.PolicyEntity) {
            this.navigationService.OpenEntityRecord(
                'MJ: AI Agent User Policies',
                CompositeKey.FromID(this.PolicyEntity.ID),
            );
        }
    }

    public MarkPolicyDirty(): void {
        this.PolicyDirty = true;
        this.cdr.markForCheck();
    }

    public SetCoordinationMode(mode: PolicyCoordinationModeValue): void {
        this.DraftPolicy.CoordinationMode = mode;
        this.MarkPolicyDirty();
    }

    public SetPolicyStatus(status: PolicyStatusValue): void {
        this.DraftPolicy.Status = status;
        this.MarkPolicyDirty();
    }

    public ToggleApprovalGuardrail(
        field:
            | 'AllowInterAgentCoordination'
            | 'RequireApprovalForExternalComms'
            | 'RequireApprovalForFinancials'
            | 'RequireApprovalForDestructiveActions',
    ): void {
        this.DraftPolicy[field] = !this.DraftPolicy[field];
        this.MarkPolicyDirty();
    }

    public OnDisplayNameInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.DraftPolicy.DisplayNameOverride = event.target.value;
            this.MarkPolicyDirty();
        }
    }

    public OnThresholdInputEvent(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.OnThresholdInput(event.target.value);
        }
    }

    public OnInstructionsOverrideInput(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
            this.DraftPolicy.InstructionsOverride = event.target.value;
            this.MarkPolicyDirty();
        }
    }

    public OnThresholdInput(rawValue: string): void {
        const trimmed = rawValue.trim();
        if (!trimmed) {
            this.DraftPolicy.AutoApproveAmountThreshold = null;
        } else {
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed) && parsed >= 0) {
                this.DraftPolicy.AutoApproveAmountThreshold = parsed;
            }
        }
        this.MarkPolicyDirty();
    }

    public ResetDraftPolicy(): void {
        this.DraftPolicy = BuildPolicyDraftFromEntity(this.PolicyEntity);
        this.PolicyDirty = false;
        this.cdr.markForCheck();
    }

    public async SaveGovernancePolicy(): Promise<void> {
        if (this.IsSavingPolicy) {
            return;
        }
        this.IsSavingPolicy = true;
        this.cdr.markForCheck();

        try {
            let entity = this.PolicyEntity;
            if (!entity) {
                entity = await this.ProviderToUse.GetEntityObject<MJAIAgentUserPolicyEntity>(
                    'MJ: AI Agent User Policies',
                    this.ProviderToUse.CurrentUser,
                );
                entity.NewRecord();
                if (!this.chiefOfStaffAgentId) {
                    throw new Error(`The "${CHIEF_OF_STAFF_AGENT_NAME}" agent id has not been resolved; reload the page.`);
                }
                entity.AgentID = this.chiefOfStaffAgentId;
                const currentUserId = this.ProviderToUse.CurrentUser?.ID;
                if (currentUserId) {
                    entity.UserID = currentUserId;
                }
            }

            entity.DisplayNameOverride =
                this.DraftPolicy.DisplayNameOverride.trim().length > 0
                    ? this.DraftPolicy.DisplayNameOverride.trim()
                    : null;
            entity.Status = this.DraftPolicy.Status;
            entity.OnboardingStatus = this.DraftPolicy.OnboardingStatus;
            entity.CoordinationMode = this.DraftPolicy.CoordinationMode;
            entity.DefaultDataAccessMode = this.DraftPolicy.DefaultDataAccessMode;
            entity.EmailChannelMode = this.DraftPolicy.EmailChannelMode;
            entity.CalendarChannelMode = this.DraftPolicy.CalendarChannelMode;
            entity.PhoneChannelMode = this.DraftPolicy.PhoneChannelMode;
            entity.MessagingChannelMode = this.DraftPolicy.MessagingChannelMode;
            entity.AllowInterAgentCoordination = this.DraftPolicy.AllowInterAgentCoordination;
            entity.RequireApprovalForExternalComms =
                this.DraftPolicy.RequireApprovalForExternalComms;
            entity.RequireApprovalForFinancials = this.DraftPolicy.RequireApprovalForFinancials;
            entity.RequireApprovalForDestructiveActions =
                this.DraftPolicy.RequireApprovalForDestructiveActions;
            entity.AutoApproveAmountThreshold = this.DraftPolicy.AutoApproveAmountThreshold;
            entity.InstructionsOverride =
                this.DraftPolicy.InstructionsOverride.trim().length > 0
                    ? this.DraftPolicy.InstructionsOverride.trim()
                    : null;

            const saved = await entity.Save();
            if (saved) {
                this.PolicyEntity = entity;
                this.DraftPolicy = BuildPolicyDraftFromEntity(entity);
                this.PolicyDirty = false;
                this.showBanner('success', 'Chief of Staff governance policy saved.');
                this.publishAgentContext();
            } else {
                const errText =
                    entity.LatestResult?.CompleteMessage ?? 'Failed to save governance policy.';
                this.showBanner('error', errText);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to save governance policy: ${msg}`);
        } finally {
            this.IsSavingPolicy = false;
            this.cdr.markForCheck();
        }
    }
}

export function LoadChiefOfStaffGovernance(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
