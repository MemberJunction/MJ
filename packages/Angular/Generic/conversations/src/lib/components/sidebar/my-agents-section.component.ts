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
import { Observable, Subject, merge } from 'rxjs';
import { debounceTime, filter, map, skip, takeUntil } from 'rxjs/operators';
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

  /** User clicked a personal agent row to open/focus its thread (or start one if none exists). */
  @Output() StartChatWithAgent = new EventEmitter<MJAIAgentEntityExtended>();
  /** User explicitly clicked the hover '+' action to start a brand-new thread with this agent. */
  @Output() StartNewChatWithAgent = new EventEmitter<MJAIAgentEntityExtended>();
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

  public OnNewChatClick(item: MyAgentDisplayItem, event: Event): void {
    event.stopPropagation();
    this.StartNewChatWithAgent.emit(item.Agent);
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
    const canCreateInstances = this.canUserCreateAgentInstances(user);
    const instantiable = canCreateInstances ? engine.GetInstantiableAgents(user) : [];
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

    // Sort order:
    //   0) Primary instance of a Required-template root (e.g., primary Chief of Staff like Pepper)
    //   1) Secondary sibling instances sharing a Required-template root (e.g., Cato)
    //   2) Other derived instances (primary first, then alphabetical — e.g., FDA Clinical Scout)
    const sortRank = (agent: MJAIAgentEntityExtended): number => {
      const root = engine.GetRootAgent(agent.ID);
      const isRequiredRoot = root?.InstantiationMode === 'Required';
      if (isRequiredRoot && agent.IsPrimaryInstance) return 0;
      if (isRequiredRoot) return 1;
      if (agent.IsPrimaryInstance) return 2;
      return 3;
    };

    const sorted = [...derived].sort((a, b) => {
      const rankDiff = sortRank(a) - sortRank(b);
      if (rankDiff !== 0) {
        return rankDiff;
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

  /**
   * Returns false when `MJ: AI Agents` entity metadata is loaded and `user` does not hold
   * `CanCreate` permission (for example external `Space Participant` users without `UI`
   * agent-instance creation rights), hiding `"Set up My Chief of Staff"` and create CTAs.
   */
  private canUserCreateAgentInstances(user: UserInfo): boolean {
    const provider = this.ProviderToUse;
    if (!provider || typeof provider.EntityByName !== 'function') {
      return true;
    }
    const agentEntity = provider.EntityByName('MJ: AI Agents');
    if (!agentEntity || typeof agentEntity.GetUserPermisions !== 'function') {
      return true;
    }
    const perms = agentEntity.GetUserPermisions(user);
    return perms?.CanCreate === true;
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
    const entityEvents$ = MJGlobal.Instance.GetEventListener(false).pipe(
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
        return (
          norm === 'mj: ai agents' ||
          norm === 'mj: ai agent personas' ||
          norm === 'mj: ai agent permissions' ||
          norm === 'mj: user settings'
        );
      })
    );

    const streams: Observable<void>[] = [entityEvents$.pipe(map(() => undefined))];
    const engine = this.aiEngine;
    if (typeof engine?.ObserveProperty === 'function') {
      streams.push(
        engine.ObserveProperty('_agents').pipe(skip(1), map(() => undefined)),
        engine.ObserveProperty('_agentPersonas').pipe(skip(1), map(() => undefined)),
        engine.ObserveProperty('_agentPermissions').pipe(skip(1), map(() => undefined))
      );
    }

    merge(...streams)
      .pipe(debounceTime(40), takeUntil(this.destroy$))
      .subscribe(() => {
        this.failedAvatars.clear();
        this.rebuildDisplayList();
      });
  }
}
