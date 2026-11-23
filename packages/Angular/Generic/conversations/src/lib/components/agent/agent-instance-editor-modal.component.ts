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
  MediaOutput,
  ParseAgentInstantiationConfig,
} from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

export interface CuratedAgentIconOption {
  IconClass: string;
  Label: string;
}

export interface AgentVibeOption {
  Key: string;
  Label: string;
  Subtitle: string;
  IconClass: string;
  Tone: string;
  SpeakingStyle: string;
  DefaultPersonaName: string;
}

export type AvatarStudioTab = 'ai' | 'icon' | 'upload';

type RunActionParamsList = NonNullable<Parameters<GraphQLActionClient['RunAction']>[1]>;

interface ActionOutputParamLike {
  Name?: string;
  Type?: string;
  Value?: MediaOutput[] | string | number | boolean | object | null;
}

interface ActionResultPayloadWithParams {
  Params?: ActionOutputParamLike[];
}

type ActionResultPayload =
  | ActionOutputParamLike[]
  | ActionResultPayloadWithParams
  | null
  | undefined;

const GENERATE_IMAGE_ACTION_NAME = 'Generate Image';
const GENERATE_IMAGE_FALLBACK_ID = '048FF309-C2CD-44D8-8A8E-8C771ADA8284';
const AVATAR_CANVAS_SIZE = 128;
const AVATAR_REFINE_PNG_SIZE = 256;
const AVATAR_WEBP_QUALITY = 0.85;
const MAX_AVATAR_HISTORY = 10;

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

const AVATAR_STYLE_PRESETS: readonly string[] = [
  '3D Clay Mascot',
  'Minimal Geometric',
  'Flat Vector Badge',
  'Cyberpunk Bot',
];

const AVATAR_QUICK_REFINEMENTS: readonly string[] = [
  'Add sleek glasses',
  'Make background teal',
  'Warm gold accent rim',
  'Cleaner minimalist flat style',
];

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

  public readonly IconOptions = DEFAULT_ICON_OPTIONS;
  public readonly CoordinationModeOptions = COORDINATION_MODES;
  public readonly AvatarStylePresets = AVATAR_STYLE_PRESETS;
  public readonly AvatarQuickRefinements = AVATAR_QUICK_REFINEMENTS;

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

  // Inline AI Avatar Studio state
  public AvatarStudioOpen = false;
  public AvatarStudioTab: AvatarStudioTab = 'ai';
  public AvatarPrompt = '';
  public SelectedAvatarStyle = '';
  public AvatarRefinePrompt = '';
  public IsGeneratingAvatar = false;
  public AvatarErrorMessage: string | null = null;
  public AvatarHistory: string[] = [];
  private lastGeneratedPngSource: { dataUri: string; pngBase64: string } | null = null;
  private cachedGenerateImageActionId: string | null = null;

  // Core form state
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
    if (this.Mode === 'edit' && this.EditingAgent) {
      return `Tailor ${this.EditingAgent.Name}`;
    }
    const base = this.SelectedBaseAgent;
    return base ? `Create Personal ${base.Name}` : 'Create Personal Agent';
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

  public get PreviewAvatarUrl(): string | null {
    if (this.AvatarPreviewError) {
      return null;
    }
    const trimmed = this.LogoURL.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  public get HasImageAvatar(): boolean {
    return this.PreviewAvatarUrl !== null;
  }

  public get AvatarStatusLabel(): string {
    const url = this.PreviewAvatarUrl;
    if (!url) {
      return 'Icon mode';
    }
    if (url.startsWith('data:image/')) {
      const kb = (Math.round((url.length / 1024) * 10) / 10).toFixed(1);
      const fmt = url.startsWith('data:image/webp') ? 'WebP' : 'Image';
      return `128×128 ${fmt} · ${kb} KB`;
    }
    return 'Custom URL';
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
      const cfg = ParseAgentInstantiationConfig(template.TypeConfiguration);
      this.IconClass = cfg?.suggestedIcons?.[0] ?? template.IconClass ?? 'fa-solid fa-wand-magic-sparkles';
    }
    if (this.IsChiefOfStaffTemplate && !this.CoordinationMode) {
      this.CoordinationMode = 'Coordinator';
    }
    this.cdr.markForCheck();
  }

  public ToggleAvatarStudio(): void {
    this.AvatarStudioOpen = !this.AvatarStudioOpen;
    if (this.AvatarStudioOpen) {
      this.TemplatePickerOpen = false;
      this.AvatarErrorMessage = null;
    }
    this.cdr.markForCheck();
  }

  public SetAvatarStudioTab(tab: AvatarStudioTab): void {
    this.AvatarStudioTab = tab;
    this.AvatarErrorMessage = null;
    this.cdr.markForCheck();
  }

  public SelectAvatarStylePreset(style: string): void {
    this.SelectedAvatarStyle = this.SelectedAvatarStyle === style ? '' : style;
    if (!this.AvatarPrompt.trim() && this.SelectedAvatarStyle) {
      this.AvatarPrompt = this.buildDefaultAvatarPrompt(this.SelectedAvatarStyle);
    }
    this.cdr.markForCheck();
  }

  public ApplySuggestedName(name: string): void {
    this.InstanceName = name;
    this.cdr.markForCheck();
  }

  public SelectIcon(iconClass: string): void {
    if (this.LogoURL.trim().length > 0) {
      this.pushAvatarHistory(this.LogoURL);
      this.LogoURL = '';
      this.AvatarPreviewError = false;
      this.lastGeneratedPngSource = null;
    }
    this.IconClass = iconClass;
    this.cdr.markForCheck();
  }

  public ClearAvatarImage(): void {
    if (this.LogoURL.trim().length > 0) {
      this.pushAvatarHistory(this.LogoURL);
      this.LogoURL = '';
      this.AvatarPreviewError = false;
      this.lastGeneratedPngSource = null;
      this.AvatarErrorMessage = null;
      this.cdr.markForCheck();
    }
  }

  public UndoAvatar(): void {
    if (this.AvatarHistory.length === 0) {
      return;
    }
    const previous = this.AvatarHistory[this.AvatarHistory.length - 1];
    this.AvatarHistory = this.AvatarHistory.slice(0, -1);
    this.LogoURL = previous;
    this.AvatarPreviewError = false;
    this.lastGeneratedPngSource = null;
    this.AvatarErrorMessage = null;
    this.cdr.markForCheck();
  }

  public OnLogoUrlChanged(): void {
    this.AvatarPreviewError = false;
    this.lastGeneratedPngSource = null;
    this.cdr.markForCheck();
  }

  public async GenerateAvatar(): Promise<void> {
    if (this.IsGeneratingAvatar) {
      return;
    }
    const promptToUse = this.composeGenerationPrompt();
    if (!this.AvatarPrompt.trim()) {
      this.AvatarPrompt = promptToUse;
    }
    await this.runAvatarImageAction(promptToUse, null);
  }

  public async RefineAvatar(): Promise<void> {
    const refineInstruction = this.AvatarRefinePrompt.trim();
    if (this.IsGeneratingAvatar || !this.HasImageAvatar || !refineInstruction) {
      return;
    }
    const sourceImage = await this.buildSourceImageForEdit();
    if (!sourceImage) {
      this.notifyAvatarFailure('Could not prepare the current avatar image for refinement.');
      return;
    }
    await this.runAvatarImageAction(refineInstruction, sourceImage);
    if (!this.AvatarErrorMessage) {
      this.AvatarRefinePrompt = '';
      this.cdr.markForCheck();
    }
  }

  public ApplyQuickRefinement(instruction: string): void {
    this.AvatarRefinePrompt = instruction;
    this.cdr.markForCheck();
    void this.RefineAvatar();
  }

  public async OnAvatarFileSelected(event: Event): Promise<void> {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.notifyAvatarFailure('Please select an image file (PNG, JPG, WebP, or GIF).', 'warning');
      if (input) {
        input.value = '';
      }
      return;
    }
    try {
      const rawDataUrl = await this.readFileAsDataUrl(file);
      const downscaled = await this.downscaleImageToAvatarDataUrl(rawDataUrl);
      this.applyNewAvatarDataUrl(downscaled, null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifyAvatarFailure(`Could not process uploaded image: ${msg}`);
    } finally {
      if (input) {
        input.value = '';
      }
    }
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
    this.AvatarPreviewError = false;
    this.ShowAllPersonas = false;
    this.TemplatePickerOpen = false;
    this.TemplateSearchText = '';
    this.SelectedTemplateCategory = 'All';
    this.AvatarStudioOpen = false;
    this.AvatarStudioTab = 'ai';
    this.AvatarPrompt = '';
    this.SelectedAvatarStyle = '';
    this.AvatarRefinePrompt = '';
    this.AvatarErrorMessage = null;
    this.AvatarHistory = [];
    this.lastGeneratedPngSource = null;
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

  private composeGenerationPrompt(): string {
    const manual = this.AvatarPrompt.trim();
    if (!manual) {
      return this.buildDefaultAvatarPrompt(this.SelectedAvatarStyle || '3D Clay Mascot');
    }
    if (
      this.SelectedAvatarStyle &&
      !manual.toLowerCase().includes(this.SelectedAvatarStyle.toLowerCase())
    ) {
      return `${manual}, ${this.SelectedAvatarStyle} style, square avatar icon, centered, no text`;
    }
    return manual;
  }

  private buildDefaultAvatarPrompt(style: string): string {
    const name = this.InstanceName.trim() || this.SelectedBaseAgent?.Name || 'AI Assistant';
    const activeVibe = this.VibeOptions.find((v) => this.IsVibeActive(v));
    const vibeHint = activeVibe ? `, ${activeVibe.Label.toLowerCase()} personality` : '';
    const styleHint = style ? `, ${style} style` : ', minimal vector avatar style';
    return `Stylized friendly avatar emblem for personal AI agent "${name}"${vibeHint}${styleHint}, centered square composition, clean background, no text`;
  }

  private async runAvatarImageAction(prompt: string, sourceImage: string | null): Promise<void> {
    this.IsGeneratingAvatar = true;
    this.AvatarErrorMessage = null;
    this.cdr.markForCheck();

    try {
      const actionId = await this.resolveGenerateImageActionId();
      const params: RunActionParamsList = [
        { Name: 'Prompt', Value: prompt, Type: 'Input' },
        { Name: 'NumberOfImages', Value: 1, Type: 'Input' },
        { Name: 'Size', Value: '1024x1024', Type: 'Input' },
        { Name: 'OutputFormat', Value: 'base64', Type: 'Input' },
      ];
      if (sourceImage) {
        params.push({ Name: 'SourceImage', Value: sourceImage, Type: 'Input' });
      }

      const client = new GraphQLActionClient(this.ProviderToUse as GraphQLDataProvider);
      const result = await client.RunAction(actionId, params);

      if (!result.Success) {
        const reason = result.Message?.trim() || 'Image generation model is unavailable or not configured.';
        this.notifyAvatarFailure(reason, 'warning');
        return;
      }

      const media = this.extractFirstMediaOutput(result.Result as ActionResultPayload);
      if (!media) {
        this.notifyAvatarFailure(
          'Image generation completed but returned no image data. Check your image model configuration.',
          'warning'
        );
        return;
      }

      const sourceDataUrl = media.data
        ? `data:${media.mimeType || 'image/png'};base64,${media.data}`
        : (media.url ?? '');
      if (!sourceDataUrl) {
        this.notifyAvatarFailure('Returned image payload contained neither base64 data nor a URL.', 'warning');
        return;
      }

      const avatarDataUrl = await this.downscaleImageToAvatarDataUrl(sourceDataUrl);
      const rawPngBase64 =
        media.data && (!media.mimeType || media.mimeType.toLowerCase().includes('png'))
          ? media.data
          : null;
      this.applyNewAvatarDataUrl(avatarDataUrl, rawPngBase64);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifyAvatarFailure(`Could not generate avatar: ${msg}`);
      LogError(`AgentInstanceEditorModal.runAvatarImageAction: ${msg}`);
    } finally {
      this.IsGeneratingAvatar = false;
      this.cdr.markForCheck();
    }
  }

  private async resolveGenerateImageActionId(): Promise<string> {
    if (this.cachedGenerateImageActionId) {
      return this.cachedGenerateImageActionId;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Actions',
        ExtraFilter: `Name = '${EscapeSQLString(GENERATE_IMAGE_ACTION_NAME)}'`,
        Fields: ['ID'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      });
      if (res.Success && res.Results && res.Results.length > 0 && res.Results[0]?.ID) {
        this.cachedGenerateImageActionId = res.Results[0].ID;
        return this.cachedGenerateImageActionId;
      }
    } catch {
      // Fall back to the shipped canonical Generate Image action ID
    }
    this.cachedGenerateImageActionId = GENERATE_IMAGE_FALLBACK_ID;
    return this.cachedGenerateImageActionId;
  }

  private extractFirstMediaOutput(payload: ActionResultPayload): MediaOutput | null {
    if (!payload) {
      return null;
    }
    const outputParams: ActionOutputParamLike[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.Params)
        ? payload.Params
        : [];
    const imagesParam = outputParams.find(
      (p) => typeof p?.Name === 'string' && p.Name.trim().toLowerCase() === 'images'
    );
    if (!imagesParam || imagesParam.Value == null) {
      return null;
    }
    let rawImages: MediaOutput[] = [];
    if (Array.isArray(imagesParam.Value)) {
      rawImages = imagesParam.Value;
    } else if (typeof imagesParam.Value === 'string') {
      try {
        const parsed = JSON.parse(imagesParam.Value) as MediaOutput[];
        if (Array.isArray(parsed)) {
          rawImages = parsed;
        }
      } catch {
        return null;
      }
    }
    const first = rawImages.find(
      (item) => Boolean(item && (item.data?.trim() || item.url?.trim()))
    );
    return first ?? null;
  }

  private async buildSourceImageForEdit(): Promise<string | null> {
    const current = this.LogoURL.trim();
    if (!current) {
      return null;
    }
    if (this.lastGeneratedPngSource && this.lastGeneratedPngSource.dataUri === current) {
      return this.lastGeneratedPngSource.pngBase64;
    }
    if (current.startsWith('http://') || current.startsWith('https://')) {
      return current;
    }
    if (current.startsWith('data:image/')) {
      const pngDataUrl = await this.convertDataUrlToPngBase64(current);
      if (pngDataUrl) {
        return pngDataUrl;
      }
      return this.stripDataUrlPrefix(current);
    }
    return current;
  }

  private stripDataUrlPrefix(dataUrl: string): string {
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  }

  private async convertDataUrlToPngBase64(dataUrl: string): Promise<string | null> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_REFINE_PNG_SIZE;
    canvas.height = AVATAR_REFINE_PNG_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    try {
      const img = await this.loadHtmlImage(dataUrl);
      ctx.drawImage(img, 0, 0, AVATAR_REFINE_PNG_SIZE, AVATAR_REFINE_PNG_SIZE);
      const pngUri = canvas.toDataURL('image/png');
      return pngUri.startsWith('data:image/png;base64,')
        ? this.stripDataUrlPrefix(pngUri)
        : null;
    } catch {
      return null;
    }
  }

  private async downscaleImageToAvatarDataUrl(sourceUrl: string): Promise<string> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return sourceUrl;
    }
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_CANVAS_SIZE;
    canvas.height = AVATAR_CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return sourceUrl;
    }
    const img = await this.loadHtmlImage(sourceUrl);
    const width = img.naturalWidth || img.width || AVATAR_CANVAS_SIZE;
    const height = img.naturalHeight || img.height || AVATAR_CANVAS_SIZE;
    const side = Math.min(width, height);
    const sx = Math.max(0, Math.floor((width - side) / 2));
    const sy = Math.max(0, Math.floor((height - side) / 2));

    ctx.clearRect(0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE);

    const webp = canvas.toDataURL('image/webp', AVATAR_WEBP_QUALITY);
    if (webp && webp.startsWith('data:image/webp')) {
      return webp;
    }
    const png = canvas.toDataURL('image/png');
    return png && png.startsWith('data:image/') ? png : sourceUrl;
  }

  private loadHtmlImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode avatar image.'));
      img.src = src;
    });
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Unsupported file reader output.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read uploaded image file.'));
      reader.readAsDataURL(file);
    });
  }

  private pushAvatarHistory(previousUrl: string): void {
    const next = [...this.AvatarHistory, previousUrl];
    this.AvatarHistory = next.length > MAX_AVATAR_HISTORY ? next.slice(next.length - MAX_AVATAR_HISTORY) : next;
  }

  private applyNewAvatarDataUrl(dataUrl: string, rawPngBase64: string | null): void {
    this.pushAvatarHistory(this.LogoURL);
    this.LogoURL = dataUrl;
    this.AvatarPreviewError = false;
    this.AvatarErrorMessage = null;
    this.lastGeneratedPngSource = rawPngBase64
      ? { dataUri: dataUrl, pngBase64: rawPngBase64 }
      : null;
    this.cdr.markForCheck();
  }

  private notifyAvatarFailure(message: string, severity: 'warning' | 'error' = 'error'): void {
    this.AvatarErrorMessage = message;
    MJNotificationService.Instance?.CreateSimpleNotification(message, severity, 5000);
    this.cdr.markForCheck();
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
