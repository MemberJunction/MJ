import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CompositeKey, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  MJAIAgentEntity,
  MJAIAgentPersonaEntity,
  MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride,
  MJAIAgentUserPolicyEntity,
  MJAIPersonaEntity,
} from '@memberjunction/core-entities';
import {
  AgentUserPolicyEngine,
  ApplyDefaultAgentUserPolicyValues,
  IAgentInstantiationConfig,
  IAgentPersonalityPreset,
  MJAIAgentEntityExtended,
  ParseAgentInstantiationConfig,
} from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';

export interface CuratedAgentIconOption {
  IconClass: string;
  Label: string;
}

const DEFAULT_ICON_OPTIONS: readonly CuratedAgentIconOption[] = [
  { IconClass: 'fa-solid fa-pepper-hot', Label: 'Pepper' },
  { IconClass: 'fa-solid fa-bolt', Label: 'Bolt' },
  { IconClass: 'fa-solid fa-chess-knight', Label: 'Strategist' },
  { IconClass: 'fa-solid fa-compass', Label: 'Compass' },
  { IconClass: 'fa-solid fa-brain', Label: 'Brain' },
  { IconClass: 'fa-solid fa-rocket', Label: 'Rocket' },
  { IconClass: 'fa-solid fa-wand-magic-sparkles', Label: 'Sparkles' },
  { IconClass: 'fa-solid fa-shield-halved', Label: 'Shield' },
  { IconClass: 'fa-solid fa-microscope', Label: 'Research' },
  { IconClass: 'fa-solid fa-database', Label: 'Data' },
  { IconClass: 'fa-solid fa-chart-line', Label: 'Analytics' },
  { IconClass: 'fa-solid fa-feather-pointed', Label: 'Writer' },
];

const FALLBACK_PERSONALITY_PRESETS: readonly IAgentPersonalityPreset[] = [
  {
    label: 'Crisp Executive',
    tone: 'Direct, analytical, concise, and action-oriented',
    speakingStyle: 'Lead with the bottom line and crisp bullet points; skip filler.',
  },
  {
    label: 'Direct, Touch Sarcastic & Funny',
    tone: 'Direct, playful, a touch sarcastic and genuinely funny',
    speakingStyle: 'Sharp wit and punchy one-liners in 1:1 chat while keeping external drafts crisp and professional.',
  },
  {
    label: 'Warm Strategic Coach',
    tone: 'Encouraging, empathetic, and thought-partnering',
    speakingStyle: 'Frame trade-offs clearly, ask clarifying questions, and keep momentum high.',
  },
  {
    label: 'Socratic Challenger',
    tone: 'Sharp, inquisitive, skeptical, and intellectually rigorous',
    speakingStyle: 'Stress-test assumptions with probing questions before recommending a path.',
  },
];

const COORDINATION_MODES: readonly {
  Value: MJAIAgentUserPolicyEntity['CoordinationMode'];
  Label: string;
  Hint: string;
}[] = [
  { Value: 'Observer', Label: 'Observer', Hint: 'Read & report only' },
  { Value: 'Coordinator', Label: 'Coordinator', Hint: 'Draft & ask approval' },
  { Value: 'Autonomous', Label: 'Autonomous', Hint: 'Act within guardrails' },
];

/**
 * Grok-Bot-style modal for creating and tailoring personal AI Agent instances
 * (`BaseAgentID != null`). Supports both:
 * - **Chat to Onboard**: launches a guided conversational setup with the selected base template.
 * - **Direct Interactive Designer**: instant form with live preview, name suggestions, icon grid,
 *   avatar URL, voice persona selector, personality presets (`Tone` & `SpeakingStyle`), standing
 *   instructions (`AdditionalInstructions`), primary instance toggle, and optional coordination mode.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-instance-editor-modal',
  templateUrl: './agent-instance-editor-modal.component.html',
  styleUrls: ['./agent-instance-editor-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentInstanceEditorModalComponent extends BaseAngularComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() Visible = false;
  @Output() VisibleChange = new EventEmitter<boolean>();

  @Input() CurrentUser: UserInfo | null = null;
  @Input() Mode: 'create' | 'edit' = 'create';
  @Input() EditingAgent: MJAIAgentEntityExtended | null = null;
  @Input() InitialBaseAgentId: string | null = null;

  /** Emitted after saving (create or update) with the refreshed derived agent entity. */
  @Output() Saved = new EventEmitter<MJAIAgentEntityExtended>();
  /** Emitted when user clicks "Chat to Onboard" with the chosen base template agent. */
  @Output() ChatToOnboard = new EventEmitter<MJAIAgentEntityExtended>();
  /** Emitted after archiving an instance with its agent ID. */
  @Output() Archived = new EventEmitter<string>();
  /** Emitted when the modal closes without saving. */
  @Output() Closed = new EventEmitter<void>();

  public readonly IconOptions = DEFAULT_ICON_OPTIONS;
  public readonly CoordinationModeOptions = COORDINATION_MODES;

  public InstantiableTemplates: MJAIAgentEntityExtended[] = [];
  public ActivePersonas: MJAIPersonaEntity[] = [];
  public ShowAllPersonas = false;

  // Form state
  public SelectedBaseAgentId = '';
  public InstanceName = '';
  public Description = '';
  public IconClass = 'fa-solid fa-pepper-hot';
  public LogoURL = '';
  public AvatarPreviewError = false;
  public SelectedPersonaId: string | null = null;
  public Tone = '';
  public SpeakingStyle = '';
  public AdditionalInstructions = '';
  public IsPrimaryInstance = true;
  public CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'] | null = null;

  public IsLoading = false;
  public IsSaving = false;
  public IsArchiving = false;
  public ConfirmArchiveOpen = false;
  public ErrorMessage: string | null = null;

  private existingSiblingCount = 0;

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (
      (changes['Visible'] && this.Visible) ||
      (this.Visible && (changes['EditingAgent'] || changes['InitialBaseAgentId'] || changes['Mode']))
    ) {
      await this.initializeForm();
    }
  }

  public get EffectiveUser(): UserInfo | null {
    return this.CurrentUser ?? this.ProviderToUse.CurrentUser ?? null;
  }

  public get DialogTitle(): string {
    if (this.Mode === 'edit' && this.EditingAgent) {
      return `Tailor ${this.EditingAgent.Name}`;
    }
    const base = this.SelectedBaseAgent;
    return base ? `Create Personal ${base.Name}` : 'Create Personal Agent';
  }

  public get SelectedBaseAgent(): MJAIAgentEntityExtended | null {
    if (!this.SelectedBaseAgentId) {
      return null;
    }
    const engine = this.aiEngine;
    return (
      this.InstantiableTemplates.find((a) => UUIDsEqual(a.ID, this.SelectedBaseAgentId)) ??
      engine.GetAgentByID(this.SelectedBaseAgentId) ??
      null
    );
  }

  public get InstantiationConfig(): IAgentInstantiationConfig | null {
    return ParseAgentInstantiationConfig(this.SelectedBaseAgent?.TypeConfiguration);
  }

  public get SuggestedNames(): string[] {
    const fromConfig = this.InstantiationConfig?.suggestedNames;
    if (fromConfig && fromConfig.length > 0) {
      return fromConfig;
    }
    return ['Pepper', 'Atlas', 'Cato', 'Jarvis', 'Vesper'];
  }

  public get PersonalityPresets(): readonly IAgentPersonalityPreset[] {
    const fromConfig = this.InstantiationConfig?.personalityPresets;
    if (fromConfig && fromConfig.length > 0) {
      return fromConfig;
    }
    return FALLBACK_PERSONALITY_PRESETS;
  }

  public get VisiblePersonas(): MJAIPersonaEntity[] {
    if (this.ShowAllPersonas) {
      return this.ActivePersonas;
    }
    return this.ActivePersonas.slice(0, 6);
  }

  public get IsChiefOfStaffTemplate(): boolean {
    const base = this.SelectedBaseAgent;
    if (!base) {
      return false;
    }
    const root = this.aiEngine.GetRootAgent(base.ID) ?? base;
    return (root.Name ?? '').trim().toLowerCase() === 'chief of staff';
  }

  public get ShowPrimaryToggle(): boolean {
    return this.Mode === 'edit' || this.existingSiblingCount > 0;
  }

  public get CanSave(): boolean {
    return (
      !this.IsSaving &&
      !this.IsArchiving &&
      this.InstanceName.trim().length > 0 &&
      (this.Mode === 'edit' || this.SelectedBaseAgentId.trim().length > 0)
    );
  }

  public get PreviewAvatarUrl(): string | null {
    if (this.AvatarPreviewError) {
      return null;
    }
    const trimmed = this.LogoURL.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private get aiEngine(): AIEngineBase {
    return AIEngineBase.GetProviderInstance<AIEngineBase>(this.ProviderToUse, AIEngineBase) as AIEngineBase;
  }

  public SelectTemplate(template: MJAIAgentEntityExtended): void {
    this.SelectedBaseAgentId = template.ID;
    this.updateSiblingCount();
    if (!this.IconClass || this.Mode === 'create') {
      const cfg = ParseAgentInstantiationConfig(template.TypeConfiguration);
      this.IconClass = cfg?.suggestedIcons?.[0] ?? template.IconClass ?? 'fa-solid fa-wand-magic-sparkles';
    }
    if (this.IsChiefOfStaffTemplate && !this.CoordinationMode) {
      this.CoordinationMode = 'Coordinator';
    }
    this.cdr.markForCheck();
  }

  public ApplySuggestedName(name: string): void {
    this.InstanceName = name;
    this.cdr.markForCheck();
  }

  public SelectIcon(iconClass: string): void {
    this.IconClass = iconClass;
    this.cdr.markForCheck();
  }

  public OnLogoUrlChanged(): void {
    this.AvatarPreviewError = false;
    this.cdr.markForCheck();
  }

  public SelectPersona(persona: MJAIPersonaEntity): void {
    if (this.SelectedPersonaId && UUIDsEqual(this.SelectedPersonaId, persona.ID)) {
      this.SelectedPersonaId = null;
    } else {
      this.SelectedPersonaId = persona.ID;
    }
    this.cdr.markForCheck();
  }

  public IsPersonaSelected(persona: MJAIPersonaEntity): boolean {
    return this.SelectedPersonaId != null && UUIDsEqual(this.SelectedPersonaId, persona.ID);
  }

  public ApplyPersonalityPreset(preset: IAgentPersonalityPreset): void {
    this.Tone = preset.tone;
    this.SpeakingStyle = preset.speakingStyle ?? '';
    this.cdr.markForCheck();
  }

  public IsPresetActive(preset: IAgentPersonalityPreset): boolean {
    return this.Tone.trim().toLowerCase() === preset.tone.trim().toLowerCase();
  }

  public SetCoordinationMode(mode: MJAIAgentUserPolicyEntity['CoordinationMode']): void {
    this.CoordinationMode = mode;
    this.cdr.markForCheck();
  }

  public OnChatToOnboardClicked(): void {
    const base = this.SelectedBaseAgent;
    if (!base) {
      return;
    }
    this.closeInternal(false);
    this.ChatToOnboard.emit(base);
  }

  public OnCancel(): void {
    this.closeInternal(true);
  }

  public async OnSave(): Promise<void> {
    if (!this.CanSave) {
      return;
    }
    const user = this.EffectiveUser;
    if (!user) {
      this.ErrorMessage = 'Sign in required to save a personal agent instance.';
      this.cdr.markForCheck();
      return;
    }

    this.IsSaving = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const engine = this.aiEngine;
      const entity = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', user);

      if (this.Mode === 'edit' && this.EditingAgent) {
        const loaded = await entity.InnerLoad(CompositeKey.FromID(this.EditingAgent.ID));
        if (!loaded) {
          throw new Error(`Could not load agent "${this.EditingAgent.Name}" for editing.`);
        }
      } else {
        const base = this.SelectedBaseAgent;
        if (!base) {
          throw new Error('Select a base agent template first.');
        }
        const effectiveBase = engine.ResolveEffectiveAgentProperties(base);
        entity.NewRecord();
        entity.BaseAgentID = base.ID;
        entity.OwnerUserID = user.ID;
        entity.InstantiationMode = 'None';
        entity.Status = 'Active';
        entity.TypeID = effectiveBase.TypeID ?? base.TypeID;
      }

      entity.Name = this.InstanceName.trim();
      entity.Description =
        this.Description.trim() ||
        (this.SelectedBaseAgent ? `Personal ${this.SelectedBaseAgent.Name} instance` : null);
      entity.IconClass = this.IconClass.trim() || null;
      entity.LogoURL = this.LogoURL.trim() || null;
      entity.AdditionalInstructions = this.AdditionalInstructions.trim() || null;
      entity.IsPrimaryInstance = this.IsPrimaryInstance;

      const savedAgent = await entity.Save();
      if (!savedAgent) {
        throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to save agent instance.');
      }

      // AIEngineBase has AutoRefresh enabled on _agents, _agentPersonas, and _agentPermissions,
      // so entity.Save() updates the in-memory cache automatically without a manual Config(true).
      await this.savePersonaConfiguration(entity.ID, user);

      // Save optional CoordinationMode / onboarding policy for Chief of Staff or when chosen
      if (this.CoordinationMode || this.IsChiefOfStaffTemplate) {
        await this.saveUserPolicy(entity.ID, entity.Name, user);
      }

      const refreshed = engine.GetAgentByID(entity.ID) ?? entity;
      this.closeInternal(false);
      this.Saved.emit(refreshed);
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
      LogError(`AgentInstanceEditorModal.OnSave: ${this.ErrorMessage}`);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  public RequestArchive(): void {
    this.ConfirmArchiveOpen = true;
    this.cdr.markForCheck();
  }

  public CancelArchive(): void {
    this.ConfirmArchiveOpen = false;
    this.cdr.markForCheck();
  }

  public async ConfirmArchive(): Promise<void> {
    const user = this.EffectiveUser;
    if (!this.EditingAgent || !user || this.IsArchiving) {
      return;
    }
    this.IsArchiving = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const entity = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', user);
      const loaded = await entity.InnerLoad(CompositeKey.FromID(this.EditingAgent.ID));
      if (!loaded) {
        throw new Error(`Could not load "${this.EditingAgent.Name}" to archive.`);
      }
      entity.Status = 'Disabled';
      entity.IsPrimaryInstance = false;
      const saved = await entity.Save();
      if (!saved) {
        throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to archive agent instance.');
      }

      const archivedId = entity.ID;
      this.closeInternal(false);
      this.Archived.emit(archivedId);
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
      LogError(`AgentInstanceEditorModal.ConfirmArchive: ${this.ErrorMessage}`);
    } finally {
      this.IsArchiving = false;
      this.ConfirmArchiveOpen = false;
      this.cdr.markForCheck();
    }
  }

  private async initializeForm(): Promise<void> {
    const user = this.EffectiveUser;
    this.IsLoading = true;
    this.ErrorMessage = null;
    this.ConfirmArchiveOpen = false;
    this.AvatarPreviewError = false;
    this.ShowAllPersonas = false;
    this.cdr.markForCheck();

    try {
      const engine = this.aiEngine;
      await engine.Config(false, user ?? undefined, this.ProviderToUse);

      this.InstantiableTemplates = user ? engine.GetInstantiableAgents(user) : [];
      const suggestedNames = new Set(['sage', 'nova', 'onyx', 'coral', 'alloy', 'verse']);
      this.ActivePersonas = [...(engine.Personas ?? [])]
        .filter((p) => p.IsActive !== false)
        .sort((a, b) => {
          const aSuggested = suggestedNames.has(a.Name.trim().toLowerCase()) ? 0 : 1;
          const bSuggested = suggestedNames.has(b.Name.trim().toLowerCase()) ? 0 : 1;
          if (aSuggested !== bSuggested) {
            return aSuggested - bSuggested;
          }
          return a.Name.localeCompare(b.Name);
        });

      if (this.Mode === 'edit' && this.EditingAgent) {
        const agent = this.EditingAgent;
        this.SelectedBaseAgentId = agent.BaseAgentID ?? '';
        this.InstanceName = agent.Name ?? '';
        this.Description = agent.Description ?? '';
        this.IconClass = agent.IconClass?.trim() || 'fa-solid fa-wand-magic-sparkles';
        this.LogoURL = agent.LogoURL ?? '';
        this.AdditionalInstructions = agent.AdditionalInstructions ?? '';
        this.IsPrimaryInstance = Boolean(agent.IsPrimaryInstance);

        const resolvedPersona = engine.ResolveAgentPersona(agent.ID);
        this.SelectedPersonaId = resolvedPersona?.Persona?.ID ?? null;
        this.Tone = resolvedPersona?.Tone ?? '';
        this.SpeakingStyle = resolvedPersona?.SpeakingStyle ?? '';
        this.CoordinationMode = null;

        if (user) {
          const pol = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
            agent.ID,
            user.ID,
            user,
            { provider: this.ProviderToUse }
          );
          if (pol.status === 'found' && pol.policy) {
            this.CoordinationMode = pol.policy.CoordinationMode;
          }
        }
      } else {
        const defaultTemplate =
          (this.InitialBaseAgentId
            ? this.InstantiableTemplates.find((t) => UUIDsEqual(t.ID, this.InitialBaseAgentId))
            : undefined) ??
          this.InstantiableTemplates.find((t) => t.InstantiationMode === 'Required') ??
          this.InstantiableTemplates[0] ??
          null;

        this.SelectedBaseAgentId = defaultTemplate?.ID ?? '';
        this.InstanceName = '';
        this.Description = '';
        const cfg = ParseAgentInstantiationConfig(defaultTemplate?.TypeConfiguration);
        this.IconClass = cfg?.suggestedIcons?.[0] ?? defaultTemplate?.IconClass ?? 'fa-solid fa-pepper-hot';
        this.LogoURL = '';
        this.AdditionalInstructions = '';
        this.Tone = '';
        this.SpeakingStyle = '';

        const preferredVoice = cfg?.suggestedPersonaNames?.[0]?.toLowerCase() ?? 'sage';
        const defaultPersona =
          this.ActivePersonas.find((p) => p.Name.trim().toLowerCase() === preferredVoice) ??
          this.ActivePersonas[0] ??
          null;
        this.SelectedPersonaId = defaultPersona?.ID ?? null;

        this.updateSiblingCount();
        this.IsPrimaryInstance = this.existingSiblingCount === 0;
        this.CoordinationMode = this.IsChiefOfStaffTemplate ? 'Coordinator' : null;
      }
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
      LogError(`AgentInstanceEditorModal.initializeForm: ${this.ErrorMessage}`);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private updateSiblingCount(): void {
    const user = this.EffectiveUser;
    if (!user || !this.SelectedBaseAgentId) {
      this.existingSiblingCount = 0;
      return;
    }
    const engine = this.aiEngine;
    const root = engine.GetRootAgent(this.SelectedBaseAgentId);
    if (!root) {
      this.existingSiblingCount = 0;
      return;
    }
    const derived = engine.GetUserDerivedAgents(user).filter((a) => {
      if (this.Mode === 'edit' && this.EditingAgent && UUIDsEqual(a.ID, this.EditingAgent.ID)) {
        return false;
      }
      if (!UUIDsEqual(a.OwnerUserID, user.ID)) {
        return false;
      }
      const r = engine.GetRootAgent(a.ID);
      return r != null && UUIDsEqual(r.ID, root.ID);
    });
    this.existingSiblingCount = derived.length;
  }

  private async savePersonaConfiguration(agentId: string, user: UserInfo): Promise<void> {
    const hasStyle = this.Tone.trim().length > 0 || this.SpeakingStyle.trim().length > 0;
    const personaId =
      this.SelectedPersonaId ?? (hasStyle ? (this.ActivePersonas[0]?.ID ?? null) : null);
    if (!personaId) {
      return;
    }

    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(md);
    const existingRes = await rv.RunView<MJAIAgentPersonaEntity>(
      {
        EntityName: 'MJ: AI Agent Personas',
        ExtraFilter: `AgentID='${agentId}' AND IsDefault=1`,
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      user
    );

    let link: MJAIAgentPersonaEntity;
    if (existingRes.Success && existingRes.Results.length > 0) {
      link = existingRes.Results[0];
    } else {
      link = await md.GetEntityObject<MJAIAgentPersonaEntity>('MJ: AI Agent Personas', user);
      link.NewRecord();
      link.AgentID = agentId;
      link.IsDefault = true;
      link.IsAllowed = true;
      link.Sequence = 10;
    }

    link.PersonaID = personaId;
    const styleObj: MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride = {
      ...(link.StyleOverrideObject ?? {}),
    };
    if (this.Tone.trim()) {
      styleObj.Tone = this.Tone.trim();
    } else {
      delete styleObj.Tone;
    }
    if (this.SpeakingStyle.trim()) {
      styleObj.SpeakingStyle = this.SpeakingStyle.trim();
    } else {
      delete styleObj.SpeakingStyle;
    }
    link.StyleOverrideObject =
      styleObj.Tone || styleObj.SpeakingStyle || styleObj.Visual ? styleObj : null;

    const saved = await link.Save();
    if (!saved) {
      throw new Error(link.LatestResult?.CompleteMessage || 'Failed to save persona style.');
    }
  }

  private async saveUserPolicy(agentId: string, displayName: string, user: UserInfo): Promise<void> {
    const md = this.ProviderToUse;
    const lookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
      agentId,
      user.ID,
      user,
      { forceRefresh: true, provider: md }
    );
    const policy = await md.GetEntityObject<MJAIAgentUserPolicyEntity>(
      'MJ: AI Agent User Policies',
      user
    );
    if (lookup.status === 'found' && lookup.policy) {
      const loaded = await policy.InnerLoad(CompositeKey.FromID(lookup.policy.ID));
      if (!loaded) {
        return;
      }
    } else {
      policy.NewRecord();
      policy.AgentID = agentId;
      policy.UserID = user.ID;
      ApplyDefaultAgentUserPolicyValues(policy);
      policy.OnboardingStatus = 'Completed';
      policy.OnboardedAt = new Date();
    }

    policy.DisplayNameOverride = displayName;
    if (this.SelectedPersonaId) {
      policy.PreferredPersonaID = this.SelectedPersonaId;
    }
    if (this.CoordinationMode) {
      policy.CoordinationMode = this.CoordinationMode;
    }

    const saved = await policy.Save();
    if (!saved) {
      throw new Error(policy.LatestResult?.CompleteMessage || 'Failed to save agent user policy.');
    }
    AgentUserPolicyEngine.Instance.SetCachedPolicy(policy);
  }

  private closeInternal(emitClosed: boolean): void {
    this.Visible = false;
    this.VisibleChange.emit(false);
    if (emitClosed) {
      this.Closed.emit();
    }
    this.cdr.markForCheck();
  }
}
