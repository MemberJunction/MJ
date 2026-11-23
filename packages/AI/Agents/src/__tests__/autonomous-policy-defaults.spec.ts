import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    ApplyDefaultAgentUserPolicyValues,
    DEFAULT_AGENT_USER_POLICY_POSTURE,
} from '@memberjunction/ai-core-plus';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

interface InMemoryPolicyFields {
    ID: string;
    AgentID: string;
    UserID: string;
    DisplayNameOverride: string | null;
    PreferredPersonaID: string | null;
    Status: MJAIAgentUserPolicyEntity['Status'] | undefined;
    OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'] | undefined;
    OnboardedAt: Date | null;
    CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'] | undefined;
    DefaultDataAccessMode: MJAIAgentUserPolicyEntity['DefaultDataAccessMode'] | undefined;
    EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'] | undefined;
    PhoneChannelMode: MJAIAgentUserPolicyEntity['PhoneChannelMode'] | undefined;
    MessagingChannelMode: MJAIAgentUserPolicyEntity['MessagingChannelMode'] | undefined;
    CalendarChannelMode: MJAIAgentUserPolicyEntity['CalendarChannelMode'] | undefined;
    AllowInterAgentCoordination: boolean | undefined;
    RequireApprovalForExternalComms: boolean | undefined;
    RequireApprovalForFinancials: boolean | undefined;
    RequireApprovalForDestructiveActions: boolean | undefined;
    AutoApproveAmountThreshold: number | null;
    EntityAccessRules: string | null;
    EntityAccessRulesObject: MJAIAgentUserPolicyEntity['EntityAccessRulesObject'];
    ActionPolicyRules: string | null;
    ActionPolicyRulesObject: MJAIAgentUserPolicyEntity['ActionPolicyRulesObject'];
    InstructionsOverride: string | null;
    Agent: string | null;
}

class InMemoryAgentUserPolicyEntity extends MJAIAgentUserPolicyEntity {
    private readonly state: InMemoryPolicyFields;
    private savedFlag = false;

    public constructor(initial: Partial<InMemoryPolicyFields> = {}) {
        super(new EntityInfo({ Name: 'MJ: AI Agent User Policies', Status: 'Active', Fields: [] }));
        this.state = {
            ID: initial.ID ?? 'policy-new-1',
            AgentID: initial.AgentID ?? 'cos-agent-1',
            UserID: initial.UserID ?? 'user-new-1',
            DisplayNameOverride: initial.DisplayNameOverride ?? null,
            PreferredPersonaID: initial.PreferredPersonaID ?? null,
            Status: initial.Status,
            OnboardingStatus: initial.OnboardingStatus,
            OnboardedAt: initial.OnboardedAt ?? null,
            CoordinationMode: initial.CoordinationMode,
            DefaultDataAccessMode: initial.DefaultDataAccessMode,
            EmailChannelMode: initial.EmailChannelMode,
            PhoneChannelMode: initial.PhoneChannelMode,
            MessagingChannelMode: initial.MessagingChannelMode,
            CalendarChannelMode: initial.CalendarChannelMode,
            AllowInterAgentCoordination: initial.AllowInterAgentCoordination,
            RequireApprovalForExternalComms: initial.RequireApprovalForExternalComms,
            RequireApprovalForFinancials: initial.RequireApprovalForFinancials,
            RequireApprovalForDestructiveActions: initial.RequireApprovalForDestructiveActions,
            AutoApproveAmountThreshold: initial.AutoApproveAmountThreshold ?? null,
            EntityAccessRules: initial.EntityAccessRules ?? null,
            EntityAccessRulesObject: initial.EntityAccessRulesObject ?? null,
            ActionPolicyRules: initial.ActionPolicyRules ?? null,
            ActionPolicyRulesObject: initial.ActionPolicyRulesObject ?? null,
            InstructionsOverride: initial.InstructionsOverride ?? null,
            Agent: initial.Agent ?? 'Chief of Staff',
        };
    }

    public override get IsSaved(): boolean {
        return this.savedFlag;
    }

    public override get ID(): string {
        return this.state.ID;
    }
    public override set ID(value: string) {
        this.state.ID = value;
    }
    public override get AgentID(): string {
        return this.state.AgentID;
    }
    public override set AgentID(value: string) {
        this.state.AgentID = value;
    }
    public override get UserID(): string {
        return this.state.UserID;
    }
    public override set UserID(value: string) {
        this.state.UserID = value;
    }
    public override get DisplayNameOverride(): string | null {
        return this.state.DisplayNameOverride;
    }
    public override set DisplayNameOverride(value: string | null) {
        this.state.DisplayNameOverride = value;
    }
    public override get PreferredPersonaID(): string | null {
        return this.state.PreferredPersonaID;
    }
    public override set PreferredPersonaID(value: string | null) {
        this.state.PreferredPersonaID = value;
    }
    public override get Status(): MJAIAgentUserPolicyEntity['Status'] {
        return this.state.Status as MJAIAgentUserPolicyEntity['Status'];
    }
    public override set Status(value: MJAIAgentUserPolicyEntity['Status']) {
        this.state.Status = value;
    }
    public override get OnboardingStatus(): MJAIAgentUserPolicyEntity['OnboardingStatus'] {
        return this.state.OnboardingStatus as MJAIAgentUserPolicyEntity['OnboardingStatus'];
    }
    public override set OnboardingStatus(value: MJAIAgentUserPolicyEntity['OnboardingStatus']) {
        this.state.OnboardingStatus = value;
    }
    public override get OnboardedAt(): Date | null {
        return this.state.OnboardedAt;
    }
    public override set OnboardedAt(value: Date | null) {
        this.state.OnboardedAt = value;
    }
    public override get CoordinationMode(): MJAIAgentUserPolicyEntity['CoordinationMode'] {
        return this.state.CoordinationMode as MJAIAgentUserPolicyEntity['CoordinationMode'];
    }
    public override set CoordinationMode(value: MJAIAgentUserPolicyEntity['CoordinationMode']) {
        this.state.CoordinationMode = value;
    }
    public override get DefaultDataAccessMode(): MJAIAgentUserPolicyEntity['DefaultDataAccessMode'] {
        return this.state.DefaultDataAccessMode as MJAIAgentUserPolicyEntity['DefaultDataAccessMode'];
    }
    public override set DefaultDataAccessMode(value: MJAIAgentUserPolicyEntity['DefaultDataAccessMode']) {
        this.state.DefaultDataAccessMode = value;
    }
    public override get EmailChannelMode(): MJAIAgentUserPolicyEntity['EmailChannelMode'] {
        return this.state.EmailChannelMode as MJAIAgentUserPolicyEntity['EmailChannelMode'];
    }
    public override set EmailChannelMode(value: MJAIAgentUserPolicyEntity['EmailChannelMode']) {
        this.state.EmailChannelMode = value;
    }
    public override get PhoneChannelMode(): MJAIAgentUserPolicyEntity['PhoneChannelMode'] {
        return this.state.PhoneChannelMode as MJAIAgentUserPolicyEntity['PhoneChannelMode'];
    }
    public override set PhoneChannelMode(value: MJAIAgentUserPolicyEntity['PhoneChannelMode']) {
        this.state.PhoneChannelMode = value;
    }
    public override get MessagingChannelMode(): MJAIAgentUserPolicyEntity['MessagingChannelMode'] {
        return this.state.MessagingChannelMode as MJAIAgentUserPolicyEntity['MessagingChannelMode'];
    }
    public override set MessagingChannelMode(value: MJAIAgentUserPolicyEntity['MessagingChannelMode']) {
        this.state.MessagingChannelMode = value;
    }
    public override get CalendarChannelMode(): MJAIAgentUserPolicyEntity['CalendarChannelMode'] {
        return this.state.CalendarChannelMode as MJAIAgentUserPolicyEntity['CalendarChannelMode'];
    }
    public override set CalendarChannelMode(value: MJAIAgentUserPolicyEntity['CalendarChannelMode']) {
        this.state.CalendarChannelMode = value;
    }
    public override get AllowInterAgentCoordination(): boolean {
        return this.state.AllowInterAgentCoordination as boolean;
    }
    public override set AllowInterAgentCoordination(value: boolean) {
        this.state.AllowInterAgentCoordination = value;
    }
    public override get RequireApprovalForExternalComms(): boolean {
        return this.state.RequireApprovalForExternalComms as boolean;
    }
    public override set RequireApprovalForExternalComms(value: boolean) {
        this.state.RequireApprovalForExternalComms = value;
    }
    public override get RequireApprovalForFinancials(): boolean {
        return this.state.RequireApprovalForFinancials as boolean;
    }
    public override set RequireApprovalForFinancials(value: boolean) {
        this.state.RequireApprovalForFinancials = value;
    }
    public override get RequireApprovalForDestructiveActions(): boolean {
        return this.state.RequireApprovalForDestructiveActions as boolean;
    }
    public override set RequireApprovalForDestructiveActions(value: boolean) {
        this.state.RequireApprovalForDestructiveActions = value;
    }
    public override get AutoApproveAmountThreshold(): number | null {
        return this.state.AutoApproveAmountThreshold;
    }
    public override set AutoApproveAmountThreshold(value: number | null) {
        this.state.AutoApproveAmountThreshold = value;
    }
    public override get EntityAccessRules(): string | null {
        return this.state.EntityAccessRules;
    }
    public override set EntityAccessRules(value: string | null) {
        this.state.EntityAccessRules = value;
    }
    public override get EntityAccessRulesObject(): MJAIAgentUserPolicyEntity['EntityAccessRulesObject'] {
        return this.state.EntityAccessRulesObject;
    }
    public override set EntityAccessRulesObject(value: MJAIAgentUserPolicyEntity['EntityAccessRulesObject']) {
        this.state.EntityAccessRulesObject = value;
    }
    public override get ActionPolicyRules(): string | null {
        return this.state.ActionPolicyRules;
    }
    public override set ActionPolicyRules(value: string | null) {
        this.state.ActionPolicyRules = value;
    }
    public override get ActionPolicyRulesObject(): MJAIAgentUserPolicyEntity['ActionPolicyRulesObject'] {
        return this.state.ActionPolicyRulesObject;
    }
    public override set ActionPolicyRulesObject(value: MJAIAgentUserPolicyEntity['ActionPolicyRulesObject']) {
        this.state.ActionPolicyRulesObject = value;
    }
    public override get InstructionsOverride(): string | null {
        return this.state.InstructionsOverride;
    }
    public override set InstructionsOverride(value: string | null) {
        this.state.InstructionsOverride = value;
    }
    public override get Agent(): string | null {
        return this.state.Agent;
    }
    public override set Agent(value: string | null) {
        this.state.Agent = value;
    }

    public override NewRecord(): boolean {
        this.savedFlag = false;
        return true;
    }

    public override async Save(): Promise<boolean> {
        this.savedFlag = true;
        return true;
    }
}

const TEST_USER = new UserInfo(null, {
    ID: 'user-new-1',
    Name: 'Morgan Taylor',
    Email: 'morgan@example.com',
    Type: 'User',
    IsActive: true,
});

describe('Slice 3 (3.3): Autonomous Coordination Policy Defaults', () => {
    beforeEach(() => {
        AgentUserPolicyEngine.Instance.ClearCache();
    });

    it('defines canonical defaults as Autonomous coordination, Email DraftOnly, Calendar ProposeWithApproval, and Phone Disabled (Off)', () => {
        expect(DEFAULT_AGENT_USER_POLICY_POSTURE).toEqual({
            Status: 'Active',
            OnboardingStatus: 'NotStarted',
            CoordinationMode: 'Autonomous',
            DefaultDataAccessMode: 'UserCeiling',
            EmailChannelMode: 'DraftOnly',
            CalendarChannelMode: 'ProposeWithApproval',
            PhoneChannelMode: 'Disabled',
            MessagingChannelMode: 'Enabled',
            AllowInterAgentCoordination: true,
            RequireApprovalForExternalComms: true,
            RequireApprovalForFinancials: true,
            RequireApprovalForDestructiveActions: true,
            AutoApproveAmountThreshold: null,
        });
    });

    it('applies Autonomous / DraftOnly / ProposeWithApproval / Disabled defaults onto new policies while preserving explicit choices', () => {
        const freshPolicy = new InMemoryAgentUserPolicyEntity();
        ApplyDefaultAgentUserPolicyValues(freshPolicy);

        expect(freshPolicy.Status).toBe('Active');
        expect(freshPolicy.OnboardingStatus).toBe('NotStarted');
        expect(freshPolicy.CoordinationMode).toBe('Autonomous');
        expect(freshPolicy.EmailChannelMode).toBe('DraftOnly');
        expect(freshPolicy.CalendarChannelMode).toBe('ProposeWithApproval');
        expect(freshPolicy.PhoneChannelMode).toBe('Disabled');
        expect(freshPolicy.MessagingChannelMode).toBe('Enabled');
        expect(freshPolicy.RequireApprovalForExternalComms).toBe(true);
        expect(freshPolicy.RequireApprovalForFinancials).toBe(true);
        expect(freshPolicy.RequireApprovalForDestructiveActions).toBe(true);

        const explicitNarrowed = new InMemoryAgentUserPolicyEntity({
            CoordinationMode: 'Coordinator',
            EmailChannelMode: 'ReadOnly',
        });
        ApplyDefaultAgentUserPolicyValues(explicitNarrowed);
        expect(explicitNarrowed.CoordinationMode).toBe('Coordinator');
        expect(explicitNarrowed.EmailChannelMode).toBe('ReadOnly');
        expect(explicitNarrowed.CalendarChannelMode).toBe('ProposeWithApproval');
        expect(explicitNarrowed.PhoneChannelMode).toBe('Disabled');
    });

    it('enforces Email DraftOnly, Calendar RequireApproval, and Phone Off verdicts for default policies', () => {
        const engine = AgentUserPolicyEngine.Instance;
        const policy = ApplyDefaultAgentUserPolicyValues(new InMemoryAgentUserPolicyEntity());

        // Email: Read and Draft allowed, direct Send denied (DraftOnly)
        expect(engine.EvaluateEmailOperation(policy, 'Read').verdict).toBe('Allow');
        expect(engine.EvaluateEmailOperation(policy, 'Draft').verdict).toBe('Allow');
        expect(engine.EvaluateEmailOperation(policy, 'Send').verdict).toBe('Deny');

        // Calendar: Read allowed, mutations require approval (ProposeWithApproval)
        expect(engine.EvaluateCalendarOperation(policy, false).verdict).toBe('Allow');
        expect(engine.EvaluateCalendarOperation(policy, true).verdict).toBe('RequireApproval');

        // Phone: Off (Disabled) blocks both inbound and outbound until explicitly enabled
        expect(engine.EvaluatePhoneOperation(policy, 'Inbound').verdict).toBe('Deny');
        expect(engine.EvaluatePhoneOperation(policy, 'Outbound').verdict).toBe('Deny');

        // Explicit user opt-in to OutboundWithApproval requires approval rather than denying outright
        const optedInPhone = ApplyDefaultAgentUserPolicyValues(
            new InMemoryAgentUserPolicyEntity({ PhoneChannelMode: 'OutboundWithApproval' })
        );
        expect(engine.EvaluatePhoneOperation(optedInPhone, 'Outbound').verdict).toBe('RequireApproval');

        // Prompt summary block reflects Autonomous + DraftOnly + ProposeWithApproval + Disabled
        const promptBlock = engine.BuildPromptPolicyContextBlock(policy, TEST_USER);
        expect(promptBlock).toContain('`Autonomous`');
        expect(promptBlock).toContain('Email=`DraftOnly`');
        expect(promptBlock).toContain('Calendar=`ProposeWithApproval`');
        expect(promptBlock).toContain('Phone=`Disabled`');
    });

    it('allows self-onboarding into Autonomous defaults while blocking self-enabling PhoneChannelMode or disabling approval gates', () => {
        const engine = AgentUserPolicyEngine.Instance;
        const defaultOnboarding = ApplyDefaultAgentUserPolicyValues(
            new InMemoryAgentUserPolicyEntity({ OnboardingStatus: 'Completed' })
        );
        expect(engine.DetectAgentPolicyWidening(null, defaultOnboarding)).toEqual([]);

        // Narrowing from Autonomous to Coordinator is allowed
        const narrowed = ApplyDefaultAgentUserPolicyValues(
            new InMemoryAgentUserPolicyEntity({ CoordinationMode: 'Coordinator' })
        );
        expect(engine.DetectAgentPolicyWidening(null, narrowed)).toEqual([]);

        // Self-enabling PhoneChannelMode from Disabled -> OutboundWithApproval is blocked
        const widenedPhone = ApplyDefaultAgentUserPolicyValues(
            new InMemoryAgentUserPolicyEntity({ PhoneChannelMode: 'OutboundWithApproval' })
        );
        expect(engine.DetectAgentPolicyWidening(null, widenedPhone).join('; ')).toMatch(/PhoneChannelMode/);

        // Self-disabling external communication approvals is blocked
        const widenedApproval = ApplyDefaultAgentUserPolicyValues(
            new InMemoryAgentUserPolicyEntity({ RequireApprovalForExternalComms: false })
        );
        expect(engine.DetectAgentPolicyWidening(null, widenedApproval).join('; ')).toMatch(
            /RequireApprovalForExternalComms/
        );
    });

    it('updates SQL migration defaults, spCreateAIAgentUserPolicy, and MJCoreEntities JSDoc defaults', () => {
        const migrationPath = path.join(
            REPO_ROOT,
            'migrations/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.sql'
        );
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain("ADD CONSTRAINT [DF_AIAgentUserPolicy_CoordinationMode] DEFAULT ('Autonomous') FOR [CoordinationMode]");
        expect(sql).toContain("ADD CONSTRAINT [DF_AIAgentUserPolicy_CalendarChannelMode] DEFAULT ('ProposeWithApproval') FOR [CalendarChannelMode]");
        expect(sql).toContain("ADD CONSTRAINT [DF_AIAgentUserPolicy_PhoneChannelMode] DEFAULT ('Disabled') FOR [PhoneChannelMode]");
        expect(sql).toContain("ISNULL(@CoordinationMode, 'Autonomous')");
        expect(sql).toContain("ISNULL(@EmailChannelMode, 'DraftOnly')");
        expect(sql).toContain("ISNULL(@PhoneChannelMode, 'Disabled')");
        expect(sql).toContain("ISNULL(@CalendarChannelMode, 'ProposeWithApproval')");
        expect(sql).toContain("spUpdateExistingEntityFieldsFromSchema");

        const entitySource = fs.readFileSync(
            path.join(REPO_ROOT, 'packages/MJCoreEntities/src/generated/entities/__mj.ts'),
            'utf8'
        );
        expect(entitySource).toContain('* * Field Name: CoordinationMode\n    * * Display Name: Coordination Mode\n    * * SQL Data Type: nvarchar(20)\n    * * Default Value: Autonomous');
        expect(entitySource).toContain('* * Field Name: PhoneChannelMode\n    * * Display Name: Phone Channel Mode\n    * * SQL Data Type: nvarchar(20)\n    * * Default Value: Disabled');
        expect(entitySource).toContain('* * Field Name: CalendarChannelMode\n    * * Display Name: Calendar Channel Mode\n    * * SQL Data Type: nvarchar(30)\n    * * Default Value: ProposeWithApproval');
    });
});
