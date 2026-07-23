/**
 * @fileoverview mj-shell-chats-surface — the W0a Chats surface (SLICE-S2).
 *
 * The composed shell's full conversation workspace, faithful to the accepted
 * functional mockup (`renderChatsSurface` / `chatRow` in
 * functional-mockup-src/app.js): toolbar (filter · By-project/Flat segment ·
 * Select mode · New chat), grouped lists with project drop-target headers or
 * a flat recency list, and per-row management — the home of the actions the
 * S1 sidebar deliberately deferred (row menu: Pin/Unpin · Move to project ·
 * Rename · Delete; multi-select bulk delete; drag-to-group).
 *
 * All mutations go through ConversationEngine (PinConversation /
 * MoveConversationToProject / SaveConversation / DeleteConversation), whose
 * entity-event reactivity updates every consumer — no manual list surgery.
 * Quiet activity dot only, never a count (ratified position 9).
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
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
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import {
  ConversationEngine,
  MJConversationEntity,
  MJProjectEntity,
} from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import {
  ShellChatsGroupMode,
  ShellPreferences,
} from '../../utils/shell-preferences';

/** One project group in by-project mode. */
interface ChatsProjectGroup {
  Project: MJProjectEntity;
  Rows: MJConversationEntity[];
}

@Component({
  selector: 'mj-shell-chats-surface',
  standalone: true,
  imports: [CommonModule, FormsModule, MJButtonDirective],
  templateUrl: './shell-chats-surface.component.html',
  styleUrls: ['./shell-chats-surface.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellChatsSurfaceComponent implements OnInit, OnDestroy {
  /** Optional provider override (multi-provider doctrine); falls back to the global. */
  @Input() Provider: IMetadataProvider | null = null;
  @Input() EnvironmentId: string | null = null;
  @Input() CurrentUser!: UserInfo;
  /** D-S7 pref — false hides the segment + project dots and forces flat mode. */
  @Input() ShowProjects = true;

  @Output() ConversationSelected = new EventEmitter<MJConversationEntity>();
  @Output() NewConversationClicked = new EventEmitter<void>();

  public FilterText = '';
  public SelectMode = false;
  public readonly SelectedIds = new Set<string>();
  public OpenMenuId: string | null = null;
  public MoveSubmenuOpen = false;
  public DragOverTarget: string | null = null;

  private readonly dialogService = inject(DialogService);
  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  /** Ungrouped drop-target sentinel (mockup `__none`). */
  public readonly UNGROUPED = '__none';

  private get engine(): ConversationEngine {
    return this.Provider
      ? (ConversationEngine.GetProviderInstance(this.Provider, ConversationEngine) as ConversationEngine)
      : ConversationEngine.Instance;
  }

  async ngOnInit(): Promise<void> {
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

  @HostListener('document:click')
  public OnDocumentClick(): void {
    if (this.OpenMenuId) {
      this.CloseMenu();
      this.cdr.markForCheck();
    }
  }

  // ── Grouping / filtering (pure derivations over the engine cache) ──

  /** Pref-backed mode, forced flat when projects are hidden (mockup line 734). */
  public get GroupMode(): ShellChatsGroupMode {
    return this.ShowProjects ? ShellPreferences.ChatsGroupMode : 'flat';
  }

  public SetGroupMode(mode: ShellChatsGroupMode): void {
    ShellPreferences.SetChatsGroupMode(mode);
    this.cdr.markForCheck();
  }

  public get Projects(): MJProjectEntity[] {
    return this.engine.Projects.filter(
      (p) => !p.IsArchived && (!this.EnvironmentId || p.EnvironmentID === this.EnvironmentId)
    );
  }

  private get inScope(): MJConversationEntity[] {
    const filter = this.FilterText.trim().toLowerCase();
    return this.engine.Conversations.filter(
      (c) =>
        !c.IsArchived &&
        (!this.EnvironmentId || c.EnvironmentID === this.EnvironmentId) &&
        (!filter ||
          (c.Name ?? '').toLowerCase().includes(filter) ||
          (c.Description ?? '').toLowerCase().includes(filter))
    );
  }

  public get PinnedRows(): MJConversationEntity[] {
    return this.byRecency(this.inScope.filter((c) => c.IsPinned));
  }

  /** Flat mode: pinned first, then everything else by recency (mockup flat list). */
  public get FlatRows(): MJConversationEntity[] {
    const scope = this.inScope;
    return [
      ...this.byRecency(scope.filter((c) => c.IsPinned)),
      ...this.byRecency(scope.filter((c) => !c.IsPinned)),
    ];
  }

  /** By-project mode: non-pinned rows grouped per project (empty groups skipped). */
  public get ProjectGroups(): ChatsProjectGroup[] {
    const scope = this.inScope.filter((c) => !c.IsPinned);
    return this.Projects.map((p) => ({
      Project: p,
      Rows: this.byRecency(scope.filter((c) => c.ProjectID === p.ID)),
    })).filter((g) => g.Rows.length > 0);
  }

  public get UngroupedRows(): MJConversationEntity[] {
    return this.byRecency(this.inScope.filter((c) => !c.IsPinned && !c.ProjectID));
  }

  public get HasAnyRows(): boolean {
    return this.inScope.length > 0;
  }

  public get VisibleIds(): string[] {
    return (this.GroupMode === 'flat'
      ? this.FlatRows
      : [...this.PinnedRows, ...this.ProjectGroups.flatMap((g) => g.Rows), ...this.UngroupedRows]
    ).map((c) => NormalizeUUID(c.ID));
  }

  private byRecency(rows: MJConversationEntity[]): MJConversationEntity[] {
    return [...rows].sort(
      (a, b) => (b.__mj_UpdatedAt?.getTime() ?? 0) - (a.__mj_UpdatedAt?.getTime() ?? 0)
    );
  }

  // ── Row presentation helpers ──

  public ProjectColor(c: MJConversationEntity): string | null {
    if (!c.ProjectID) return null;
    const p = this.engine.Projects.find((x) => x.ID === c.ProjectID);
    return p?.Color || 'var(--mj-brand-primary)';
  }

  public ProjectName(c: MJConversationEntity): string {
    if (!c.ProjectID) return 'Ungrouped';
    return this.engine.Projects.find((x) => x.ID === c.ProjectID)?.Name ?? 'Project';
  }

  public HasActivity(c: MJConversationEntity): boolean {
    return this.notificationService.getBadgeConfig(c.ID).show;
  }

  /** Compact relative-age label ("now", "3h", "2d", "4w"). */
  public TimeLabel(c: MJConversationEntity): string {
    const at = c.__mj_UpdatedAt?.getTime();
    if (!at) return '';
    const mins = Math.max(0, Math.floor((Date.now() - at) / 60000));
    if (mins < 60) return mins < 2 ? 'now' : `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w`;
    return `${Math.floor(days / 30)}mo`;
  }

  // ── Selection ──

  public ToggleSelectMode(): void {
    this.SelectMode = !this.SelectMode;
    if (!this.SelectMode) this.SelectedIds.clear();
    this.CloseMenu();
    this.cdr.markForCheck();
  }

  public IsSelected(c: MJConversationEntity): boolean {
    return this.SelectedIds.has(NormalizeUUID(c.ID));
  }

  public OnRowClicked(c: MJConversationEntity): void {
    if (this.SelectMode) {
      const key = NormalizeUUID(c.ID);
      if (this.SelectedIds.has(key)) this.SelectedIds.delete(key);
      else this.SelectedIds.add(key);
      this.cdr.markForCheck();
      return;
    }
    this.notificationService.markConversationAsRead(c.ID);
    this.ConversationSelected.emit(c);
  }

  public SelectAllVisible(): void {
    for (const id of this.VisibleIds) this.SelectedIds.add(id);
    this.cdr.markForCheck();
  }

  public async BulkDelete(): Promise<void> {
    const count = this.SelectedIds.size;
    if (!count) return;
    const confirmed = await this.dialogService.confirm({
      title: 'Delete Conversations',
      message: `Are you sure you want to delete ${count} conversation${count === 1 ? '' : 's'}? This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      dangerous: true,
    });
    if (!confirmed) return;

    let failed = 0;
    for (const id of [...this.SelectedIds]) {
      try {
        await this.engine.DeleteConversation(id, this.CurrentUser);
        this.SelectedIds.delete(id);
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      await this.dialogService.alert(
        'Some deletions failed',
        `${count - failed} deleted; ${failed} could not be deleted. They remain selected — try again or deselect them.`
      );
    } else {
      this.SelectMode = false;
    }
    this.cdr.markForCheck();
  }

  // ── Row menu actions (the S1-deferred management set) ──

  public ToggleMenu(c: MJConversationEntity, event: Event): void {
    event.stopPropagation();
    this.OpenMenuId = this.OpenMenuId === c.ID ? null : c.ID;
    this.MoveSubmenuOpen = false;
    this.cdr.markForCheck();
  }

  public CloseMenu(): void {
    this.OpenMenuId = null;
    this.MoveSubmenuOpen = false;
  }

  public ToggleMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.MoveSubmenuOpen = !this.MoveSubmenuOpen;
    this.cdr.markForCheck();
  }

  public async TogglePin(c: MJConversationEntity, event: Event): Promise<void> {
    event.stopPropagation();
    this.CloseMenu();
    try {
      await this.engine.PinConversation(c.ID, !c.IsPinned, this.CurrentUser);
    } catch {
      await this.dialogService.alert('Error', 'Failed to pin/unpin conversation. Please try again.');
    }
    this.cdr.markForCheck();
  }

  public async Rename(c: MJConversationEntity, event: Event): Promise<void> {
    event.stopPropagation();
    this.CloseMenu();
    try {
      const result = await this.dialogService.input({
        title: 'Edit Conversation',
        message: 'Update the name and description for this conversation',
        inputLabel: 'Conversation Name',
        inputValue: c.Name || '',
        placeholder: 'My Conversation',
        required: true,
        secondInputLabel: 'Description',
        secondInputValue: c.Description || '',
        secondInputPlaceholder: 'Optional description',
        secondInputRequired: false,
        okText: 'Save',
        cancelText: 'Cancel',
      });
      if (result) {
        const name = typeof result === 'string' ? result : result.value;
        const description = typeof result === 'string' ? c.Description : result.secondValue;
        if (name !== c.Name || description !== c.Description) {
          await this.engine.SaveConversation(c.ID, { Name: name, Description: description || '' }, this.CurrentUser);
        }
      }
    } catch {
      await this.dialogService.alert('Error', 'Failed to update conversation. Please try again.');
    }
    this.cdr.markForCheck();
  }

  public async Delete(c: MJConversationEntity, event: Event): Promise<void> {
    event.stopPropagation();
    this.CloseMenu();
    try {
      const confirmed = await this.dialogService.confirm({
        title: 'Delete Conversation',
        message: `Are you sure you want to delete "${c.Name}"? This action cannot be undone.`,
        okText: 'Delete',
        cancelText: 'Cancel',
        dangerous: true,
      });
      if (confirmed) {
        await this.engine.DeleteConversation(c.ID, this.CurrentUser);
      }
    } catch {
      await this.dialogService.alert('Error', 'Failed to delete conversation. Please try again.');
    }
    this.cdr.markForCheck();
  }

  public async MoveTo(c: MJConversationEntity, projectId: string | null, event: Event): Promise<void> {
    event.stopPropagation();
    this.CloseMenu();
    try {
      await this.engine.MoveConversationToProject(c.ID, projectId, this.CurrentUser);
    } catch {
      await this.dialogService.alert('Error', 'Failed to move conversation. Please try again.');
    }
    this.cdr.markForCheck();
  }

  // ── Drag-to-group (grouped mode only) ──

  public OnDragStart(c: MJConversationEntity, event: DragEvent): void {
    event.dataTransfer?.setData('text/mj-conversation-id', c.ID);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  public OnDragOver(target: string, event: DragEvent): void {
    event.preventDefault();
    if (this.DragOverTarget !== target) {
      this.DragOverTarget = target;
      this.cdr.markForCheck();
    }
  }

  public OnDragLeave(target: string): void {
    if (this.DragOverTarget === target) {
      this.DragOverTarget = null;
      this.cdr.markForCheck();
    }
  }

  public async OnDrop(target: string, event: DragEvent): Promise<void> {
    event.preventDefault();
    this.DragOverTarget = null;
    const id = event.dataTransfer?.getData('text/mj-conversation-id');
    if (!id) return;
    const projectId = target === this.UNGROUPED ? null : target;
    try {
      await this.engine.MoveConversationToProject(id, projectId, this.CurrentUser);
    } catch {
      await this.dialogService.alert('Error', 'Failed to move conversation. Please try again.');
    }
    this.cdr.markForCheck();
  }
}
