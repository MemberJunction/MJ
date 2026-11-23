import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { BaseEntity, BaseEntityEvent, LogError, UserInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJEvent, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';

export interface MyAgentDisplayItem {
  Agent: MJAIAgentEntityExtended;
  BaseAgentName: string | null;
  ShowPrimaryStar: boolean;
  AvatarUrl: string | null;
  IconClass: string;
}

/**
 * Grok-Bot-style "My Agents" left-rail section in the Conversations sidebar.
 *
 * Displays:
 * - The user's active personal/shared derived agent instances (*Pepper*, *Cato*, *FDA Clinical Scout*)
 *   with custom avatar/icon, base-agent badge, primary star (when multiple instances share a root),
 *   click-to-chat, and a Tailor button (`fa-solid fa-sliders`) to edit identity/personality/instructions.
 * - An inviting setup CTA card ("Set up My Chief of Staff") whenever the user has 0 instances for an
 *   instantiable template with `InstantiationMode === 'Required'`.
 * - A `+` button to create a new personal agent instance from any instantiable template via
 *   `AgentInstanceEditorModalComponent` (supporting both "Chat to Onboard" and Direct Designer).
 */
@Component({
  standalone: false,
  selector: 'mj-my-agents-section',
  templateUrl: './my-agents-section.component.html',
  styleUrls: ['./my-agents-section.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyAgentsSectionComponent
  extends BaseAngularComponent
  implements OnInit, OnChanges, OnDestroy
{
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  @Input() CurrentUser: UserInfo | null = null;
  @Input() ShowMyAgents = true;
  @Input() ActiveAgentId: string | null = null;

  /** User clicked a personal agent row to start a fresh chat pinned to it. */
  @Output() StartChatWithAgent = new EventEmitter<MJAIAgentEntityExtended>();
  /** User chose "Chat to Onboard" for a template agent (e.g., Chief of Staff). */
  @Output() StartOnboardingWithTemplate = new EventEmitter<MJAIAgentEntityExtended>();
  /** Emitted after an instance is created, updated, or archived from the modal. */
  @Output() AgentInstanceChanged = new EventEmitter<MJAIAgentEntityExtended | null>();

  public IsExpanded = true;
  public MyAgents: MyAgentDisplayItem[] = [];
  public UnonboardedRequiredTemplates: MJAIAgentEntityExtended[] = [];
  public HasInstantiableTemplates = false;

  // Editor modal state
  public EditorVisible = false;
  public EditorMode: 'create' | 'edit' = 'create';
  public EditingAgent: MJAIAgentEntityExtended | null = null;
  public InitialBaseAgentId: string | null = null;

  private failedAvatars = new Set<string>();
  private initialized = false;

  public get EffectiveUser(): UserInfo | null {
    return this.CurrentUser ?? this.ProviderToUse.CurrentUser ?? null;
  }

  public get IsVisible(): boolean {
    if (!this.ShowMyAgents) {
      return false;
    }
    return (
      this.MyAgents.length > 0 ||
      this.UnonboardedRequiredTemplates.length > 0 ||
      this.HasInstantiableTemplates
    );
  }

  async ngOnInit(): Promise<void> {
    this.subscribeToAgentChanges();
    if (this.ShowMyAgents) {
      await this.loadAgents(false);
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['CurrentUser'] && this.ShowMyAgents) {
      await this.loadAgents(false);
    }
    if (changes['ShowMyAgents'] && this.ShowMyAgents && !this.initialized) {
      await this.loadAgents(false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public ToggleExpanded(): void {
    this.IsExpanded = !this.IsExpanded;
    this.cdr.markForCheck();
  }

  public IsActiveAgent(agentId: string): boolean {
    return this.ActiveAgentId != null && UUIDsEqual(this.ActiveAgentId, agentId);
  }

  public OpenCreateModal(event?: Event, baseAgentId?: string | null): void {
    event?.stopPropagation();
    this.EditorMode = 'create';
    this.EditingAgent = null;
    this.InitialBaseAgentId = baseAgentId ?? null;
    this.EditorVisible = true;
    this.cdr.markForCheck();
  }

  public OpenEditModal(agent: MJAIAgentEntityExtended, event: Event): void {
    event.stopPropagation();
    this.EditorMode = 'edit';
    this.EditingAgent = agent;
    this.InitialBaseAgentId = agent.BaseAgentID ?? null;
    this.EditorVisible = true;
    this.cdr.markForCheck();
  }

  public OnAgentRowClick(item: MyAgentDisplayItem): void {
    this.StartChatWithAgent.emit(item.Agent);
  }

  public OnAvatarError(agentId: string): void {
    this.failedAvatars.add(agentId.toLowerCase());
    this.rebuildDisplayList();
  }

  public OnEditorSaved(agent: MJAIAgentEntityExtended): void {
    this.failedAvatars.delete(agent.ID.toLowerCase());
    this.rebuildDisplayList();
    this.AgentInstanceChanged.emit(agent);
  }

  public OnEditorArchived(): void {
    this.rebuildDisplayList();
    this.AgentInstanceChanged.emit(null);
  }

  public OnEditorChatToOnboard(template: MJAIAgentEntityExtended): void {
    this.StartOnboardingWithTemplate.emit(template);
  }

  private get aiEngine(): AIEngineBase {
    return AIEngineBase.GetProviderInstance<AIEngineBase>(this.ProviderToUse, AIEngineBase) as AIEngineBase;
  }

  private async loadAgents(forceRefresh: boolean): Promise<void> {
    this.initialized = true;
    const user = this.EffectiveUser;
    if (!user) {
      return;
    }
    try {
      await this.aiEngine.Config(forceRefresh, user, this.ProviderToUse);
      this.rebuildDisplayList();
    } catch (err) {
      LogError(`MyAgentsSection.loadAgents: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private rebuildDisplayList(): void {
    const user = this.EffectiveUser;
    if (!user) {
      this.MyAgents = [];
      this.UnonboardedRequiredTemplates = [];
      this.HasInstantiableTemplates = false;
      this.cdr.markForCheck();
      return;
    }

    const engine = this.aiEngine;
    const derived = engine.GetUserDerivedAgents(user);
    const instantiable = engine.GetInstantiableAgents(user);
    this.HasInstantiableTemplates = instantiable.length > 0;

    // Count siblings per root so the primary star shows cleanly when user has 2+ instances of a root
    const countByRoot = new Map<string, number>();
    const rootsWithInstance = new Set<string>();
    for (const agent of derived) {
      const root = engine.GetRootAgent(agent.ID);
      if (root) {
        const key = root.ID.toLowerCase();
        countByRoot.set(key, (countByRoot.get(key) ?? 0) + 1);
        rootsWithInstance.add(key);
      }
    }

    const sorted = [...derived].sort((a, b) => {
      if (Boolean(a.IsPrimaryInstance) !== Boolean(b.IsPrimaryInstance)) {
        return a.IsPrimaryInstance ? -1 : 1;
      }
      return (a.Name ?? '').localeCompare(b.Name ?? '');
    });

    this.MyAgents = sorted.map((agent) => {
      const base = agent.BaseAgentID ? engine.GetAgentByID(agent.BaseAgentID) : undefined;
      const root = engine.GetRootAgent(agent.ID);
      const siblingCount = root ? (countByRoot.get(root.ID.toLowerCase()) ?? 1) : 1;
      const personaImg = engine.ResolveAgentPersona(agent.ID)?.Persona?.PreviewImageURL ?? null;
      const rawUrl = agent.LogoURL?.trim() || personaImg?.trim() || null;
      const avatarUrl =
        rawUrl && !this.failedAvatars.has(agent.ID.toLowerCase()) ? rawUrl : null;
      return {
        Agent: agent,
        BaseAgentName: base?.Name ?? null,
        ShowPrimaryStar: Boolean(agent.IsPrimaryInstance) && siblingCount > 1,
        AvatarUrl: avatarUrl,
        IconClass: this.normalizeIcon(agent.IconClass || base?.IconClass || 'fa-solid fa-robot'),
      };
    });

    this.UnonboardedRequiredTemplates = instantiable.filter(
      (tpl) =>
        tpl.InstantiationMode === 'Required' && !rootsWithInstance.has(tpl.ID.toLowerCase())
    );

    this.cdr.markForCheck();
  }

  private normalizeIcon(icon: string): string {
    const trimmed = icon.trim();
    if (!trimmed) {
      return 'fa-solid fa-robot';
    }
    if (/\bfa-(solid|regular|brands|light|thin|duotone)\b|\bfa[srbltd]\b/.test(trimmed)) {
      return trimmed;
    }
    return `fa-solid ${trimmed}`;
  }

  private subscribeToAgentChanges(): void {
    MJGlobal.Instance.GetEventListener(false)
      .pipe(
        filter((event: MJEvent) => {
          if (
            event.event !== MJEventType.ComponentEvent ||
            event.eventCode !== BaseEntity.BaseEventCode ||
            !event.args
          ) {
            return false;
          }
          const args = event.args as BaseEntityEvent;
          const entityName =
            args.type === 'remote-invalidate'
              ? args.entityName
              : args.baseEntity?.EntityInfo?.Name;
          const norm = entityName?.trim().toLowerCase() ?? '';
          return norm === 'mj: ai agents' || norm === 'mj: ai agent personas';
        }),
        debounceTime(400),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        void this.loadAgents(true);
      });
  }
}
