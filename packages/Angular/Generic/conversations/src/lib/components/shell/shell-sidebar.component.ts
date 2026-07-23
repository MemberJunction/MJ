/**
 * @fileoverview mj-shell-sidebar — the composed shell's two-path sidebar (SLICE-S1).
 *
 * Faithful to the accepted functional mockup (`renderSidebar` / `sideRow2` in
 * functional-mockup-src/app.js) and D-S7: two paths only —
 *
 *   1. Top-level nav: Chats · Projects (pref-gated, F0 teaching line when empty)
 *      · Collections · Routines, with the Settings gear pinned at the bottom.
 *   2. Pinned + Recents conversation rows (project color-dot, hollow = ungrouped,
 *      quiet activity dot — never a count, per ratified position 9).
 *
 * DELIBERATE OMISSIONS (on record in SLICE-S1): no folder tree (management and
 * grouping live on the W0a Chats surface, S2), no row context menus (same),
 * no unread affordances beyond the quiet dot (D-S9 substrate pending).
 *
 * Data comes from `ConversationEngine` (cached, reactive); selection state comes
 * DOWN via inputs and events flow UP — the frame orchestrates (state doctrine).
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { Subject, takeUntil } from 'rxjs';
import { IMetadataProvider } from '@memberjunction/core';
import {
  ConversationEngine,
  MJConversationEntity,
  MJProjectEntity,
} from '@memberjunction/core-entities';
import { NotificationService } from '../../services/notification.service';
import { ShellView } from './shell-types';
import { ShellSidebarDensity } from '../../utils/shell-preferences';

/** One top-level nav entry. */
interface ShellNavItem {
  View: ShellView;
  Icon: string;
  Label: string;
}

@Component({
  selector: 'mj-shell-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, MJButtonDirective],
  templateUrl: './shell-sidebar.component.html',
  styleUrls: ['./shell-sidebar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellSidebarComponent implements OnInit, OnDestroy {
  /** Optional provider override (multi-provider doctrine); falls back to the global. */
  @Input() Provider: IMetadataProvider | null = null;
  /** Scope conversations/projects to one environment. */
  @Input() EnvironmentId: string | null = null;
  /** Currently active shell view (drives nav highlight). */
  @Input() ActiveView: ShellView = 'chats';
  /** Currently open conversation (drives row highlight). */
  @Input() ActiveConversationId: string | null = null;
  /** D-S7 Show Projects preference — hides the Projects nav item AND project dots when false (F0x). */
  @Input() ShowProjects = true;
  /** Sidebar density (Settings → Sidebar density). */
  @Input() Density: ShellSidebarDensity = 'comfortable';

  @Output() ViewSelected = new EventEmitter<ShellView>();
  @Output() ConversationSelected = new EventEmitter<MJConversationEntity>();
  @Output() NewConversationClicked = new EventEmitter<void>();
  @Output() SettingsClicked = new EventEmitter<void>();
  @Output() CreateProjectClicked = new EventEmitter<void>();

  /** Live filter over conversation title + description (mockup `sideFilter`). */
  public FilterText = '';

  public readonly NavItems: ShellNavItem[] = [
    { View: 'chats', Icon: 'fa-comments', Label: 'Chats' },
    { View: 'projects', Icon: 'fa-folder', Label: 'Projects' },
    { View: 'collections', Icon: 'fa-layer-group', Label: 'Collections' },
    { View: 'routines', Icon: 'fa-clock-rotate-left', Label: 'Routines' },
  ];

  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  /** Memoized list computation (recomputed only when inputs to it change). */
  private memoSource: MJConversationEntity[] | null = null;
  private memoFilter = '';
  private memoEnvironment: string | null = null;
  private memoPinned: MJConversationEntity[] = [];
  private memoRecents: MJConversationEntity[] = [];

  private get engine(): ConversationEngine {
    // GetProviderInstance is typed as BaseEngine<T>; the registry stores/returns the
    // concrete subclass instance, so the cast is safe (same pattern as other engine consumers).
    return this.Provider
      ? (ConversationEngine.GetProviderInstance(this.Provider, ConversationEngine) as ConversationEngine)
      : ConversationEngine.Instance;
  }

  async ngOnInit(): Promise<void> {
    // Lazy engine load (no-op when already configured), then react to cache changes.
    await this.engine.Config(false, undefined, this.Provider ?? undefined);
    this.engine.Conversations$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.engine.Projects$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.notificationService.notifications$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** True when the Projects nav should render its F0 teaching line (visible + zero projects). */
  public get ShowTeachingLine(): boolean {
    return this.ShowProjects && this.Projects.length === 0;
  }

  public get Projects(): MJProjectEntity[] {
    return this.engine.Projects.filter(
      (p) => !p.IsArchived && (!this.EnvironmentId || p.EnvironmentID === this.EnvironmentId)
    );
  }

  public get PinnedConversations(): MJConversationEntity[] {
    this.recompute();
    return this.memoPinned;
  }

  public get RecentConversations(): MJConversationEntity[] {
    this.recompute();
    return this.memoRecents;
  }

  public NavVisible(item: ShellNavItem): boolean {
    return item.View !== 'projects' || this.ShowProjects;
  }

  /** Project color for a conversation's dot; null → hollow (ungrouped). */
  public ProjectColor(conversation: MJConversationEntity): string | null {
    if (!conversation.ProjectID) return null;
    const project = this.engine.Projects.find((p) => p.ID === conversation.ProjectID);
    return project?.Color || 'var(--mj-brand-primary)';
  }

  public ProjectName(conversation: MJConversationEntity): string {
    if (!conversation.ProjectID) return 'Ungrouped';
    return this.engine.Projects.find((p) => p.ID === conversation.ProjectID)?.Name ?? 'Project';
  }

  /** Quiet activity dot — any pending notification renders as a dot, never a count (position 9). */
  public HasActivity(conversation: MJConversationEntity): boolean {
    return this.notificationService.getBadgeConfig(conversation.ID).show;
  }

  public OnRowClicked(conversation: MJConversationEntity): void {
    this.notificationService.markConversationAsRead(conversation.ID);
    this.ConversationSelected.emit(conversation);
  }

  public OnFilterChanged(): void {
    this.cdr.markForCheck();
  }

  private recompute(): void {
    const source = this.engine.Conversations;
    const filter = this.FilterText.trim().toLowerCase();
    if (source === this.memoSource && filter === this.memoFilter && this.EnvironmentId === this.memoEnvironment) {
      return;
    }
    this.memoSource = source;
    this.memoFilter = filter;
    this.memoEnvironment = this.EnvironmentId;

    const inScope = source.filter(
      (c) =>
        !c.IsArchived &&
        (!this.EnvironmentId || c.EnvironmentID === this.EnvironmentId) &&
        (!filter ||
          (c.Name ?? '').toLowerCase().includes(filter) ||
          (c.Description ?? '').toLowerCase().includes(filter))
    );
    this.memoPinned = inScope.filter((c) => c.IsPinned);
    this.memoRecents = inScope
      .filter((c) => !c.IsPinned)
      .sort((a, b) => (b.__mj_UpdatedAt?.getTime() ?? 0) - (a.__mj_UpdatedAt?.getTime() ?? 0))
      .slice(0, 10);
  }
}
