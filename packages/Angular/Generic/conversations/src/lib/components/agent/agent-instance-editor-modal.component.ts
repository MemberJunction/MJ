import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
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
  ResolveAgentInstantiationConfig,
} from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  type AvatarChangeEvent,
  type AvatarPromptBuilder,
  MjAvatarStudioComponent,
} from '@memberjunction/ng-avatar-studio';
import { UUIDsEqual } from '@memberjunction/global';

export interface AgentVibeOption {
  Key: string;
  Label: string;
  Subtitle: string;
  IconClass: string;
  Tone: string;
  SpeakingStyle: string;
  DefaultPersonaName: string;
}

const DEFAULT_VIBE_OPTIONS: readonly AgentVibeOption[] = [
  {
    Key: 'witty',
    Label: 'Direct & Witty',
    Subtitle: 'High-signal bullets with dry humor in 1:1 chat',
    IconClass: 'fa-solid fa-bolt',
    Tone: 'Direct, playful, a touch sarcastic and genuinely funny',
    SpeakingStyle: 'High-signal bullets with dry humor in 1:1 chat while keeping external drafts crisp and professional.',
    DefaultPersonaName: 'Coral',
  },
  {
    Key: 'executive',
    Label: 'Crisp Executive',
    Subtitle: 'Zero fluff; bottom-line conclusions first',
    IconClass: 'fa-solid fa-bullseye',
    Tone: 'Direct, analytical, concise, and action-oriented',
    SpeakingStyle: 'Zero fluff; lead with bottom-line conclusions and crisp bullet points.',
    DefaultPersonaName: 'Sage',
  },
  {
    Key: 'socratic',
    Label: 'Socratic Challenger',
    Subtitle: 'Steelmans counter-arguments & stress-tests plans',
    IconClass: 'fa-solid fa-chess-knight',
    Tone: 'Sharp, inquisitive, skeptical, and intellectually rigorous',
    SpeakingStyle: 'Steelman counter-arguments and stress-test assumptions before recommending a path.',
    DefaultPersonaName: 'Onyx',
  },
  {
    Key: 'coach',
    Label: 'Warm Coach',
    Subtitle: 'Encouraging, structured, thoughtful pacing',
    IconClass: 'fa-solid fa-handshake',
    Tone: 'Encouraging, empathetic, and thought-partnering',
    SpeakingStyle: 'Structured, thoughtful pacing; frame trade-offs clearly and keep momentum high.',
    DefaultPersonaName: 'Verse',
  },
];

const COORDINATION_MODES: readonly {
  Value: MJAIAgentUserPolicyEntity['CoordinationMode'];
  Label: string;
  Hint: string;
}[] = [
  { Value: 'Observer', Label: 'Observer', Hint: 'Read & brief only' },
  { Value: 'Coordinator', Label: 'Coordinator', Hint: 'Draft & ask approval' },
  { Value: 'Autonomous', Label: 'Autonomous', Hint: 'Act within guardrails' },
];

/**
 * Progressive-disclosure studio modal for creating and tailoring personal AI Agent instances
 * (`BaseAgentID != null`).
 *
 * Features:
 * - Compact Identity Header with clickable 68x68 avatar trigger, adaptive searchable base template
 *   picker (scales cleanly from 2 to 50+ templates), and "Chat to Onboard" handoff.
 * - Inline AI Avatar Studio (`128x128` WebP Base64 stored in `AIAgent.LogoURL`) powered by MJ's
 *   `Generate Image` action with iterative image-to-image refinement, undo history, icon grid,
 *   local file upload (auto-downscaled), and custom URL input.
 * - 30-second core form (Name + 2x2 Personality Vibe archetypes bundling Tone, SpeakingStyle, and
 *   a cross-vendor Voice Persona default) plus a collapsible progressive-disclosure accordion for
 *   voice selection, fine-tuned tone/style, role, standing instructions, autonomy, and primary flag.
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

  public readonly CoordinationModeOptions = COORDINATION_MODES;
  public readonly AvatarPromptBuilderFn: AvatarPromptBuilder = (style: string) =>
    this.BuildContextualAvatarPrompt(style);

  @ViewChild(MjAvatarStudioComponent)
  public AvatarStudioRef?: MjAvatarStudioComponent;

  public InstantiableTemplates: MJAIAgentEntityExtended[] = [];
  public ActivePersonas: MJAIPersonaEntity[] = [];
  public ShowAllPersonas = false;

  // Responsive dialog width (clamped to viewport so narrow screens never clip)
  public DialogWidth = 560;

  // Progressive disclosure & drawers
  public TemplatePickerOpen = false;
  public TemplateSearchText = '';
  public SelectedTemplateCategory = 'All';
  public AdvancedExpanded = false;

  // Full-dialog overlay Avatar Studio state (delegated to @memberjunction/ng-avatar-studio)
  public AvatarStudioOpen = false;
  public IsGeneratingAvatar = false;

  // Core form state
  public SelectedBaseAgentId = '';
  public InstanceName = '';
  public Description = '';
  public IconClass = 'fa-solid fa-pepper-hot';
  public LogoURL = '';
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

  @HostListener('window:resize')
  public OnWindowResize(): void {
    const prev = this.DialogWidth;
    this.updateDialogWidth();
    if (this.Visible && this.DialogWidth !== prev) {
      this.cdr.markForCheck();
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (
      (changes['Visible'] && this.Visible) ||
      (this.Visible && (changes['EditingAgent'] || changes['InitialBaseAgentId'] || changes['Mode']))
    ) {
      this.updateDialogWidth();
      await this.initializeForm();
    }
  }

  public get EffectiveUser(): UserInfo | null {
    return this.CurrentUser ?? this.ProviderToUse.CurrentUser ?? null;
  }

  public get DialogTitle(): string {
    if (this.AvatarStudioOpen) {
      const targetName =
        this.InstanceName.trim() ||
        this.EditingAgent?.Name?.trim() ||
        this.SelectedBaseAgent?.Name?.trim() ||
        'Agent';
      return `Avatar Studio — ${targetName}`;
    }
    if (this.Mode === 'edit' && this.EditingAgent) {
      return `Tailor ${this.EditingAgent.Name}`;
    }
    const base = this.SelectedBaseAgent;
    return base ? `Create Personal ${base.Name}` : 'Create Personal Agent';
  }

  public get StudioSubjectSubtitle(): string {
    const parts: string[] = [];
    if (this.SelectedBaseAgent?.Name) {
      parts.push(this.SelectedBaseAgent.Name);
    }
    const activeVibe = this.VibeOptions.find((v) => this.IsVibeActive(v));
    if (activeVibe) {
      parts.push(activeVibe.Label);
    } else if (this.Tone.trim()) {
      parts.push(this.truncateContextSnippet(this.Tone, 48));
    }
    if (this.Description.trim()) {
      parts.push(this.truncateContextSnippet(this.Description, 64));
    }
    return parts.length > 0 ? parts.join(' · ') : 'Personal AI Agent';
  }

  public get SaveButtonLabel(): string {
    if (this.IsSaving) {
      return 'Saving...';
    }
    if (this.Mode === 'edit') {
      return 'Save Changes';
    }
    const trimmed = this.InstanceName.trim();
    return trimmed ? `Create ${trimmed}` : 'Create Agent';
  }

  public get MentionHandle(): string {
    const cleaned = this.InstanceName.trim().replace(/\s+/g, '');
    return cleaned || 'Agent';
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
    return this.resolveInstantiationConfigForTemplate(this.SelectedBaseAgent);
  }

  private resolveInstantiationConfigForTemplate(
    template: MJAIAgentEntityExtended | null | undefined
  ): IAgentInstantiationConfig | null {
    if (!template) {
      return null;
    }
    const effective =
      typeof this.aiEngine.ResolveEffectiveAgentProperties === 'function'
        ? this.aiEngine.ResolveEffectiveAgentProperties(template)
        : null;
    return ResolveAgentInstantiationConfig(
      effective?.Configuration ?? template.Configuration,
      effective?.TypeConfiguration ?? template.TypeConfiguration
    );
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
    return DEFAULT_VIBE_OPTIONS.map((v) => ({
      label: v.Label,
      tone: v.Tone,
      speakingStyle: v.SpeakingStyle,
      description: v.Subtitle,
    }));
  }

  public get VibeOptions(): readonly AgentVibeOption[] {
    const fromConfig = this.InstantiationConfig?.personalityPresets;
    if (!fromConfig || fromConfig.length === 0) {
      return DEFAULT_VIBE_OPTIONS;
    }
    return fromConfig.map((preset, idx) => this.mapPresetToVibeOption(preset, idx));
  }

  public get IsCustomVibe(): boolean {
    const hasCustomText = this.Tone.trim().length > 0 || this.SpeakingStyle.trim().length > 0;
    if (!hasCustomText) {
      return false;
    }
    return !this.VibeOptions.some((v) => this.IsVibeActive(v));
  }

  public get SelectedPersona(): MJAIPersonaEntity | null {
    if (!this.SelectedPersonaId) {
      return null;
    }
    return this.ActivePersonas.find((p) => UUIDsEqual(p.ID, this.SelectedPersonaId)) ?? null;
  }

  public get AdvancedSummaryLabel(): string {
    const parts: string[] = [];
    if (this.SelectedPersona) {
      parts.push(this.SelectedPersona.Name);
    }
    if (this.IsChiefOfStaffTemplate && this.CoordinationMode) {
      parts.push(this.CoordinationMode);
    }
    if (this.AdditionalInstructions.trim().length > 0) {
      parts.push('Custom rules');
    } else if (this.IsCustomVibe) {
      parts.push('Custom tone');
    }
    return parts.length > 0 ? parts.join(' · ') : 'Default settings';
  }

  public get TemplateCategories(): readonly string[] {
    const categories = new Set<string>();
    for (const tpl of this.InstantiableTemplates) {
      categories.add(this.GetTemplateCategory(tpl));
    }
    return ['All', ...Array.from(categories)];
  }

  public get FilteredTemplates(): MJAIAgentEntityExtended[] {
    const q = this.TemplateSearchText.trim().toLowerCase();
    return this.InstantiableTemplates.filter((tpl) => {
      if (
        this.SelectedTemplateCategory !== 'All' &&
        this.GetTemplateCategory(tpl) !== this.SelectedTemplateCategory
      ) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = `${tpl.Name ?? ''} ${tpl.Description ?? ''} ${this.GetTemplateCategory(tpl)}`.toLowerCase();
      return haystack.includes(q);
    });
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
      !this.IsGeneratingAvatar &&
      this.InstanceName.trim().length > 0 &&
      (this.Mode === 'edit' || this.SelectedBaseAgentId.trim().length > 0)
    );
  }

  public get HasImageAvatar(): boolean {
    return this.LogoURL.trim().length > 0;
  }

  public get StudioSubjectName(): string {
    return (
      this.InstanceName.trim() ||
      this.EditingAgent?.Name?.trim() ||
      this.SelectedBaseAgent?.Name?.trim() ||
      'Your Personal Agent'
    );
  }

  public get AvatarHistoryCount(): number {
    return this.AvatarStudioRef?.HistoryCount ?? 0;
  }

  private get aiEngine(): AIEngineBase {
    return AIEngineBase.GetProviderInstance<AIEngineBase>(this.ProviderToUse, AIEngineBase) as AIEngineBase;
  }

  public GetTemplateCategory(tpl: MJAIAgentEntityExtended): string {
    if (tpl.BaseAgentID) {
      return 'Shared Dept';
    }
    const text = `${tpl.Name ?? ''} ${tpl.Description ?? ''}`.toLowerCase();
    if (
      tpl.InstantiationMode === 'Required' ||
      text.includes('chief of staff') ||
      text.includes('executive') ||
      text.includes('coordinator')
    ) {
      return 'Executive';
    }
    if (
      text.includes('research') ||
      text.includes('query') ||
      text.includes('data') ||
      text.includes('analyst') ||
      text.includes('sql')
    ) {
      return 'Data & Research';
    }
    return 'General';
  }

  public ToggleTemplatePicker(): void {
    this.TemplatePickerOpen = !this.TemplatePickerOpen;
    if (this.TemplatePickerOpen) {
      this.AvatarStudioOpen = false;
    }
    this.cdr.markForCheck();
  }

  public SetTemplateCategory(category: string): void {
    this.SelectedTemplateCategory = category;
    this.cdr.markForCheck();
  }

  public SelectTemplate(template: MJAIAgentEntityExtended): void {
    this.SelectedBaseAgentId = template.ID;
    this.TemplatePickerOpen = false;
    this.TemplateSearchText = '';
    this.SelectedTemplateCategory = 'All';
    this.updateSiblingCount();
    if (!this.IconClass || this.Mode === 'create') {
      const cfg = this.resolveInstantiationConfigForTemplate(template);
      this.IconClass = cfg?.suggestedIcons?.[0] ?? template.IconClass ?? 'fa-solid fa-wand-magic-sparkles';
    }
    if (this.IsChiefOfStaffTemplate && !this.CoordinationMode) {
      this.CoordinationMode = 'Coordinator';
    }
    this.cdr.markForCheck();
  }

  public ToggleAvatarStudio(): void {
    if (this.AvatarStudioOpen) {
      this.CloseAvatarStudio();
    } else {
      this.OpenAvatarStudio();
    }
  }

  public OpenAvatarStudio(): void {
    this.AvatarStudioOpen = true;
    this.TemplatePickerOpen = false;
    this.cdr.markForCheck();
  }

  public CloseAvatarStudio(): void {
    this.AvatarStudioOpen = false;
    this.cdr.markForCheck();
  }

  public OnAvatarStudioChange(event: AvatarChangeEvent): void {
    this.LogoURL = event.ImageUrl;
    this.IconClass = event.IconClass;
    this.cdr.markForCheck();
  }

  public OnAvatarGeneratingChange(isGenerating: boolean): void {
    this.IsGeneratingAvatar = isGenerating;
    this.cdr.markForCheck();
  }

  public ApplySuggestedName(name: string): void {
    this.InstanceName = name;
    this.cdr.markForCheck();
  }

  public ClearAvatarImage(): void {
    if (this.AvatarStudioRef) {
      this.AvatarStudioRef.ClearAvatarImage();
    } else if (this.LogoURL.trim().length > 0) {
      this.LogoURL = '';
    }
    this.cdr.markForCheck();
  }

  public UndoAvatar(): void {
    this.AvatarStudioRef?.Undo();
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

  public ApplyVibe(vibe: AgentVibeOption): void {
    this.Tone = vibe.Tone;
    this.SpeakingStyle = vibe.SpeakingStyle;
    const matchedPersona = this.findPersonaByName(vibe.DefaultPersonaName);
    if (matchedPersona) {
      this.SelectedPersonaId = matchedPersona.ID;
    }
    this.cdr.markForCheck();
  }

  public IsVibeActive(vibe: AgentVibeOption): boolean {
    return this.Tone.trim().toLowerCase() === vibe.Tone.trim().toLowerCase();
  }

  public ApplyPersonalityPreset(preset: IAgentPersonalityPreset): void {
    const mapped = this.VibeOptions.find(
      (v) => v.Label.toLowerCase() === preset.label.toLowerCase()
    );
    if (mapped) {
      this.ApplyVibe(mapped);
      return;
    }
    this.Tone = preset.tone;
    this.SpeakingStyle = preset.speakingStyle ?? '';
    this.cdr.markForCheck();
  }

  public IsPresetActive(preset: IAgentPersonalityPreset): boolean {
    return this.Tone.trim().toLowerCase() === preset.tone.trim().toLowerCase();
  }

  public OnAdvancedToggle(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) {
      this.AdvancedExpanded = event.target.open;
      this.cdr.markForCheck();
    }
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

  private updateDialogWidth(): void {
    if (typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
      this.DialogWidth = Math.max(320, Math.min(560, window.innerWidth - 24));
    } else {
      this.DialogWidth = 560;
    }
  }

  private async initializeForm(): Promise<void> {
    const user = this.EffectiveUser;
    this.IsLoading = true;
    this.ErrorMessage = null;
    this.ConfirmArchiveOpen = false;
    this.ShowAllPersonas = false;
    this.TemplatePickerOpen = false;
    this.TemplateSearchText = '';
    this.SelectedTemplateCategory = 'All';
    this.AvatarStudioOpen = false;
    this.IsGeneratingAvatar = false;
    this.cdr.markForCheck();

    try {
      const engine = this.aiEngine;
      await engine.Config(false, user ?? undefined, this.ProviderToUse);

      this.InstantiableTemplates = user ? engine.GetInstantiableAgents(user) : [];
      const suggestedNames = new Set(['coral', 'sage', 'onyx', 'verse', 'alloy', 'ash', 'ballad']);
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
        this.updateSiblingCount();
        this.AdvancedExpanded =
          this.AdditionalInstructions.trim().length > 0 ||
          this.Description.trim().length > 0 ||
          this.Tone.trim().length > 0 ||
          this.SpeakingStyle.trim().length > 0;
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
        const cfg = this.resolveInstantiationConfigForTemplate(defaultTemplate);
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
        this.AdvancedExpanded = false;
      }
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
      LogError(`AgentInstanceEditorModal.initializeForm: ${this.ErrorMessage}`);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private mapPresetToVibeOption(preset: IAgentPersonalityPreset, index: number): AgentVibeOption {
    const combined = `${preset.label} ${preset.tone} ${preset.speakingStyle}`.toLowerCase();
    let iconClass = 'fa-solid fa-wand-magic-sparkles';
    let defaultPersonaName = 'Sage';

    if (
      combined.includes('witty') ||
      combined.includes('sarcastic') ||
      combined.includes('funny') ||
      combined.includes('playful')
    ) {
      iconClass = 'fa-solid fa-bolt';
      defaultPersonaName = 'Coral';
    } else if (
      combined.includes('socratic') ||
      combined.includes('challenger') ||
      combined.includes('skeptical') ||
      combined.includes('rigorous')
    ) {
      iconClass = 'fa-solid fa-chess-knight';
      defaultPersonaName = 'Onyx';
    } else if (
      combined.includes('warm') ||
      combined.includes('coach') ||
      combined.includes('empathetic') ||
      combined.includes('encouraging')
    ) {
      iconClass = 'fa-solid fa-handshake';
      defaultPersonaName = 'Verse';
    } else if (
      combined.includes('executive') ||
      combined.includes('crisp') ||
      combined.includes('concise') ||
      combined.includes('analytical')
    ) {
      iconClass = 'fa-solid fa-bullseye';
      defaultPersonaName = 'Sage';
    } else {
      const fallback = DEFAULT_VIBE_OPTIONS[index % DEFAULT_VIBE_OPTIONS.length];
      iconClass = fallback.IconClass;
      defaultPersonaName = fallback.DefaultPersonaName;
    }

    return {
      Key: `preset-${index}`,
      Label: preset.label,
      Subtitle: preset.description || preset.speakingStyle || preset.tone,
      IconClass: iconClass,
      Tone: preset.tone,
      SpeakingStyle: preset.speakingStyle ?? '',
      DefaultPersonaName: defaultPersonaName,
    };
  }

  private findPersonaByName(name: string): MJAIPersonaEntity | null {
    const target = name.trim().toLowerCase();
    const direct = this.ActivePersonas.find((p) => p.Name.trim().toLowerCase() === target);
    if (direct) {
      return direct;
    }
    if (target === 'onyx') {
      return this.ActivePersonas.find((p) => p.Name.trim().toLowerCase() === 'echo') ?? null;
    }
    return null;
  }

  /**
   * Synthesizes a rich, agent-aware avatar generation prompt combining the agent's name,
   * base template domain, custom role/focus, personality/tone, standing instructions cues,
   * and selected visual style so generated avatars reflect what the agent actually does.
   */
  public BuildContextualAvatarPrompt(styleOverride?: string): string {
    const base = this.SelectedBaseAgent;
    const rawName = this.InstanceName.trim() || this.EditingAgent?.Name?.trim() || '';
    const baseName = base?.Name?.trim() || 'AI Assistant';
    const displaySubject = rawName ? `"${rawName}" (${baseName})` : baseName;

    const segments: string[] = [`Avatar portrait for personal AI agent ${displaySubject}.`];

    const customRole = this.Description.trim();
    const baseDesc = base?.Description?.trim() ?? '';
    const isGenericBoilerplateRole = /^personal\s+.+\s+instance\.?$/i.test(customRole);
    if (customRole && !isGenericBoilerplateRole) {
      segments.push(`Role & focus: ${this.truncateContextSnippet(customRole, 140)}.`);
    } else if (baseDesc) {
      segments.push(`Domain: ${this.truncateContextSnippet(baseDesc, 130)}.`);
    }

    const activeVibe = this.VibeOptions.find((v) => this.IsVibeActive(v));
    const toneText = this.Tone.trim();
    if (activeVibe && toneText) {
      segments.push(`Personality: ${activeVibe.Label} (${this.truncateContextSnippet(toneText, 90)}).`);
    } else if (activeVibe) {
      segments.push(`Personality: ${activeVibe.Label} — ${this.truncateContextSnippet(activeVibe.Subtitle, 90)}.`);
    } else if (toneText) {
      segments.push(`Personality & tone: ${this.truncateContextSnippet(toneText, 100)}.`);
    }

    const standing = this.AdditionalInstructions.trim();
    if (standing) {
      segments.push(`Specialties: ${this.truncateContextSnippet(standing, 120)}.`);
    }

    const chosenStyle = (styleOverride ?? '3D Clay Mascot').trim() || '3D Clay Mascot';
    segments.push(
      `Visual style: ${chosenStyle}. Centered square avatar icon with expressive character/motif matching this role, clean contrasting background, crisp at 128x128px, no text, no letters, no watermarks.`
    );

    return segments.join(' ');
  }

  private truncateContextSnippet(raw: string, maxLen: number): string {
    const singleLine = raw.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
    if (singleLine.length <= maxLen) {
      return singleLine;
    }
    return `${singleLine.slice(0, maxLen - 1).trimEnd()}…`;
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
