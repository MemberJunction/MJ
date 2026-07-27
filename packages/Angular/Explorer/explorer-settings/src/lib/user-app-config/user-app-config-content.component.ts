import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef, NgZone, ElementRef, inject } from '@angular/core';
import { LogError, LogStatus, IMetadataProvider, LogStatusEx } from '@memberjunction/core';
import { MJUserApplicationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { moveAndResequence, resequenceItems } from './user-app-config-reorder';

/**
 * Represents an app item in the configuration UI
 */
interface AppConfigItem {
  app: BaseApplication;
  userAppId: string | null;
  sequence: number;
  isActive: boolean;
  isDirty: boolean;
}

/**
 * Chrome-free app-configuration content: select which applications appear in
 * the app switcher and arrange their order. Owns all list/reorder/persistence
 * logic (including its own Reset / Save / Cancel footer) but NO overlay —
 * hosts embed it wherever it should live:
 *  - `UserAppConfigComponent` wraps it in the full-screen modal (Home dashboard)
 *  - the shell's app launcher embeds it as an in-panel view swap
 *
 * Loads on init (hosts create it fresh under an `@if`), saves in a batch on
 * the Save button, and signals the host via `Saved` / `Cancelled` — the host
 * decides what "done" means (close the dialog, swap the view back, etc.).
 */
@Component({
  standalone: false,
  selector: 'mj-user-app-config-content',
  templateUrl: './user-app-config-content.component.html',
  styleUrls: ['./user-app-config-content.component.css']
})
export class UserAppConfigContentComponent extends BaseAngularComponent implements OnInit {
  private appManager = inject(ApplicationManager);
  private sharedService = inject(SharedService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private el = inject(ElementRef);

  /** Emitted once after a successful batch save */
  @Output() Saved = new EventEmitter<void>();
  /** Emitted when the user cancels (or saves with nothing to save) */
  @Output() Cancelled = new EventEmitter<void>();

  /** Every system app the user is authorized for, joined with their per-user config */
  AllApps: AppConfigItem[] = [];
  /** Apps the user has enabled, in their configured Sequence order */
  ActiveApps: AppConfigItem[] = [];
  /** Apps not yet enabled, alphabetical */
  AvailableApps: AppConfigItem[] = [];

  /** True while the initial configuration load is in flight */
  IsLoading = false;
  /** True while the batch save is in flight (disables the footer buttons) */
  IsSaving = false;
  /** User-facing load/save failure message; empty when healthy */
  ErrorMessage = '';

  /** Collapse state for the Available-apps panel (mobile accordion) */
  AvailablePanelCollapsed = false;
  /** Collapse state for the Selected-apps panel (mobile accordion) */
  SelectedPanelCollapsed = false;

  /** Item currently being dragged for reorder, null when idle */
  DraggedItem: AppConfigItem | null = null;
  /** Source index of the in-flight drag within ActiveApps */
  DraggedIndex = -1;
  /** Index the drag is currently hovering (drop indicator position) */
  DropTargetIndex = -1;

  async ngOnInit(): Promise<void> {
    await this.loadConfiguration();
  }

  /**
   * Adds an app to the user's active list
   */
  AddApp(item: AppConfigItem): void {
    item.isActive = true;
    item.sequence = this.ActiveApps.length;
    item.isDirty = true;
    this.refreshAppLists();
  }

  /**
   * Removes an app from the user's active list
   */
  RemoveApp(item: AppConfigItem): void {
    item.isActive = false;
    item.sequence = 999;
    item.isDirty = true;
    this.refreshAppLists();

    this.resequenceActiveApps();
  }

  /**
   * Toggles an app between active and inactive
   */
  ToggleApp(item: AppConfigItem): void {
    if (item.isActive) {
      this.RemoveApp(item);
    } else {
      this.AddApp(item);
    }
  }

  /**
   * Moves an app up in the order. Positional (splice + renumber), NOT a sequence-value
   * swap: rows can carry duplicate Sequence values (issue #3027 — e.g. a re-enabled app
   * kept a stale value), and swapping two equal values is a silent no-op. Reordering by
   * position then renumbering 0..n-1 always works and heals duplicates as a side effect.
   */
  MoveUp(item: AppConfigItem): void {
    const index = this.ActiveApps.indexOf(item);
    if (index > 0) {
      this.moveActiveApp(index, index - 1);
    }
  }

  /**
   * Moves an app down in the order. Positional — see {@link MoveUp} for why.
   */
  MoveDown(item: AppConfigItem): void {
    const index = this.ActiveApps.indexOf(item);
    if (index >= 0 && index < this.ActiveApps.length - 1) {
      this.moveActiveApp(index, index + 1);
    }
  }

  private moveActiveApp(fromIndex: number, toIndex: number): void {
    this.ActiveApps = moveAndResequence(this.ActiveApps, fromIndex, toIndex);
  }

  /**
   * Checks if there are any unsaved changes
   */
  HasChanges(): boolean {
    return this.AllApps.some(item => item.isDirty);
  }

  /** Cancel button — host decides what dismissal means */
  Cancel(): void {
    this.Cancelled.emit();
  }

  /**
   * Saves the user's app configuration
   */
  async Save(): Promise<void> {
    if (!this.HasChanges()) {
      this.Cancelled.emit();
      return;
    }

    this.IsSaving = true;
    this.ErrorMessage = '';

    try {
      // Self-heal: renumber active apps 0..n-1 before persisting. Existing rows can
      // carry duplicate Sequence values from older data (issue #3027); renumbering in
      // display order marks any corrected rows dirty so this save fixes them for good.
      this.resequenceActiveApps();

      const md = this.ProviderToUse;

      for (const item of this.AllApps) {
        if (!item.isDirty) continue;

        if (item.userAppId) {
          await this.updateUserApplication(md, item);
        } else if (item.isActive) {
          await this.createUserApplication(md, item);
        }
      }

      // Each userApp.Save() above fires a BaseEntity 'save' event, which UserInfoEngine
      // catches via HandleIndividualBaseEntityEvent → debounced refresh → NotifyDataChange.
      // ApplicationManager.subscribeToEngineChanges then propagates to the shell app
      // switcher. No explicit reload needed here — and avoiding it sidesteps NG0100
      // from observable emissions interleaving with this method's save loop.
      LogStatusEx({
        message: 'User app configuration saved',
        verboseOnly: true
      });

      this.sharedService.CreateSimpleNotification('App configuration saved successfully!', 'success', 3000);
      this.Saved.emit();
      // Backstop for a dropped/coalesced debounced engine event: force a reconcile from the source
      // of truth so the app switcher can't be left "one save behind". DEFERRED past the current CD
      // cycle — a synchronous reload here previously triggered NG0100 (commits e2059e6114 /
      // 7bf8be7dc6). No-op cost when the event chain already delivered. (Ported from bug F1's fix
      // to the pre-split monolith, PR #3289.)
      Promise.resolve().then(() => this.appManager.ReloadUserApplications());

    } catch (error) {
      this.ErrorMessage = 'Failed to save configuration. Please try again.';
      LogError('Error saving app configuration:', undefined, error instanceof Error ? error.message : String(error));
      // A partial-save failure can leave in-memory state half-committed (some items saved+clean,
      // others still dirty) and divergent from the DB. Reconcile from the source of truth so
      // recovery doesn't require a browser refresh — deferred, for the same NG0100 reason.
      Promise.resolve().then(() => this.appManager.ReloadUserApplications());
    } finally {
      this.ngZone.run(() => {
        this.IsSaving = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Resets all changes and reloads the configuration
   */
  async Reset(): Promise<void> {
    await this.loadConfiguration();
  }

  // ---------------------------------------------------------------------------
  //  Drag-and-drop handlers (desktop only)
  // ---------------------------------------------------------------------------

  /** Begin an HTML5 drag of an active-app row */
  OnDragStart(event: DragEvent, item: AppConfigItem, index: number): void {
    this.DraggedItem = item;
    this.DraggedIndex = index;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  /** Allow dropping while a row drag passes over the list */
  OnDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /** Track the row index the drag is hovering (drop indicator) */
  OnDragEnter(event: DragEvent, index: number): void {
    event.preventDefault();
    this.DropTargetIndex = index;
  }

  /** Clear all drag state (fires on drop or drag cancel) */
  OnDragEnd(): void {
    this.DraggedItem = null;
    this.DraggedIndex = -1;
    this.DropTargetIndex = -1;
  }

  /** Reorder ActiveApps to the hovered position and renumber sequences */
  OnDrop(event: DragEvent): void {
    event.preventDefault();

    if (this.DraggedIndex >= 0 && this.DropTargetIndex >= 0 && this.DraggedIndex !== this.DropTargetIndex) {
      const [movedItem] = this.ActiveApps.splice(this.DraggedIndex, 1);
      this.ActiveApps.splice(this.DropTargetIndex, 0, movedItem);
      this.resequenceActiveApps();
      this.cdr.detectChanges();
    }

    this.OnDragEnd();
  }

  // ---------------------------------------------------------------------------
  //  Touch drag-and-drop handlers (mobile)
  // ---------------------------------------------------------------------------

  /** Source index of the in-flight touch drag (-1 when idle) */
  TouchDragIndex = -1;
  /** Row index the touch drag would drop at */
  TouchDropIndex = -1;
  /** True while a touch drag is in progress */
  TouchDragActive = false;

  private touchStartY = 0;
  private touchCurrentY = 0;
  private touchRowHeight = 0;
  private touchDragElement: HTMLElement | null = null;
  private touchScrollContainer: HTMLElement | null = null;

  /** Begin a touch drag of a mobile app row (long-press handle) */
  OnTouchDragStart(event: TouchEvent, index: number): void {
    const touch = event.touches[0];
    const row = (event.target as HTMLElement).closest('.mobile-app-row') as HTMLElement | null;
    if (!row) return;

    event.preventDefault();
    this.TouchDragIndex = index;
    this.TouchDropIndex = index;
    this.TouchDragActive = true;
    this.touchStartY = touch.clientY;
    this.touchCurrentY = touch.clientY;
    this.touchDragElement = row;
    this.touchRowHeight = row.offsetHeight;
    this.touchScrollContainer = this.el.nativeElement.querySelector('.mobile-list');

    row.classList.add('touch-dragging');
  }

  /** Follow the finger: translate the row, track drop target, auto-scroll near edges */
  OnTouchDragMove(event: TouchEvent): void {
    if (!this.TouchDragActive || !this.touchDragElement) return;

    event.preventDefault();
    const touch = event.touches[0];
    this.touchCurrentY = touch.clientY;
    const deltaY = this.touchCurrentY - this.touchStartY;

    this.touchDragElement.style.transform = `translateY(${deltaY}px)`;
    this.touchDragElement.style.zIndex = '100';

    this.updateTouchDropTarget(deltaY);
    this.autoScrollIfNeeded();
  }

  /** Commit the touch reorder (if moved) and reset touch-drag state */
  OnTouchDragEnd(): void {
    if (!this.TouchDragActive) return;

    if (this.touchDragElement) {
      this.touchDragElement.style.transform = '';
      this.touchDragElement.style.zIndex = '';
      this.touchDragElement.classList.remove('touch-dragging');
    }

    if (this.TouchDragIndex >= 0 && this.TouchDropIndex >= 0 && this.TouchDragIndex !== this.TouchDropIndex) {
      const [movedItem] = this.ActiveApps.splice(this.TouchDragIndex, 1);
      this.ActiveApps.splice(this.TouchDropIndex, 0, movedItem);
      this.resequenceActiveApps();
    }

    this.resetTouchDragState();
    this.cdr.detectChanges();
  }

  private updateTouchDropTarget(deltaY: number): void {
    const rowsToMove = Math.round(deltaY / this.touchRowHeight);
    const newIndex = Math.max(0, Math.min(this.ActiveApps.length - 1, this.TouchDragIndex + rowsToMove));
    this.TouchDropIndex = newIndex;
  }

  private autoScrollIfNeeded(): void {
    if (!this.touchScrollContainer) return;

    const rect = this.touchScrollContainer.getBoundingClientRect();
    const edgeZone = 40;

    if (this.touchCurrentY < rect.top + edgeZone) {
      this.touchScrollContainer.scrollTop -= 8;
    } else if (this.touchCurrentY > rect.bottom - edgeZone) {
      this.touchScrollContainer.scrollTop += 8;
    }
  }

  private resetTouchDragState(): void {
    this.TouchDragIndex = -1;
    this.TouchDropIndex = -1;
    this.TouchDragActive = false;
    this.touchDragElement = null;
    this.touchScrollContainer = null;
  }

  // ---------------------------------------------------------------------------
  //  Private helpers
  // ---------------------------------------------------------------------------

  private async loadConfiguration(): Promise<void> {
    this.IsLoading = true;
    this.ErrorMessage = '';

    try {
      // Read directly from UserInfoEngine's cache. The engine already loaded
      // and maintains MJ: User Applications via its event-driven refresh — no
      // need to re-query the DB on every open. EnsureLoaded is idempotent
      // and instant when the engine is already loaded (the typical case here,
      // since UserInfoEngine fires at startup).
      const provider = this.ProviderToUse;
      const engine = provider
        ? UserInfoEngine.GetProviderInstance<UserInfoEngine>(provider, UserInfoEngine) as UserInfoEngine
        : UserInfoEngine.Instance;
      await engine.EnsureLoaded();
      const systemApps = this.appManager.GetAuthorizedSystemApps();
      const userApps = engine.UserApplications;
      this.AllApps = this.buildAppConfigItems(systemApps, userApps);
      this.refreshAppLists();

    } catch (error) {
      this.ErrorMessage = 'Failed to load app configuration. Please try again.';
      LogError('Error loading app configuration:', undefined, error instanceof Error ? error.message : String(error));
    } finally {
      this.ngZone.run(() => {
        this.IsLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  private buildAppConfigItems(systemApps: BaseApplication[], userApps: MJUserApplicationEntity[]): AppConfigItem[] {
    return systemApps.map(app => {
      const userApp = userApps.find(ua => UUIDsEqual(ua.ApplicationID, app.ID));
      return {
        app,
        userAppId: userApp?.ID ?? null,
        sequence: userApp?.Sequence ?? 999,
        isActive: userApp?.IsActive ?? false,
        isDirty: false
      };
    });
  }

  private refreshAppLists(): void {
    this.ActiveApps = this.AllApps
      .filter(item => item.isActive)
      .sort((a, b) => a.sequence - b.sequence);

    this.AvailableApps = this.AllApps
      .filter(item => !item.isActive)
      .sort((a, b) => a.app.Name.localeCompare(b.app.Name));
  }

  private resequenceActiveApps(): void {
    resequenceItems(this.ActiveApps);
  }


  private async updateUserApplication(md: IMetadataProvider, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', md.CurrentUser);
    await userApp.Load(item.userAppId!);

    userApp.Sequence = item.sequence;
    userApp.IsActive = item.isActive;

    const saved = await userApp.Save();
    if (!saved) {
      throw new Error(`Failed to update UserApplication for ${item.app.Name}: ${userApp.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    item.isDirty = false;
    LogStatus(`Updated UserApplication for ${item.app.Name}: sequence=${item.sequence}, isActive=${item.isActive}`);
  }

  private async createUserApplication(md: IMetadataProvider, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', md.CurrentUser);
    userApp.NewRecord();

    userApp.UserID = md.CurrentUser.ID;
    userApp.ApplicationID = item.app.ID;
    userApp.Sequence = item.sequence;
    userApp.IsActive = item.isActive;

    const saved = await userApp.Save();
    if (!saved) {
      throw new Error(`Failed to create UserApplication for ${item.app.Name}: ${userApp.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    item.userAppId = userApp.ID;
    item.isDirty = false;
    LogStatus(`Created UserApplication for ${item.app.Name}: sequence=${item.sequence}`);
  }
}
