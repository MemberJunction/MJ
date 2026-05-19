import { Component, Input, Output, EventEmitter, ChangeDetectorRef, NgZone, ElementRef, inject } from '@angular/core';
import { Metadata, LogError, LogStatus, IMetadataProvider, LogStatusEx } from '@memberjunction/core';
import { MJUserApplicationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
 * Full-screen modal dialog for configuring user's application visibility and order.
 * Allows users to:
 * - Select which applications to show in the app switcher
 * - Reorder applications via drag-and-drop (desktop)
 * - Toggle apps on/off in a single list (mobile)
 */
@Component({
  standalone: false,
  selector: 'mj-user-app-config',
  templateUrl: './user-app-config.component.html',
  styleUrls: ['./user-app-config.component.css']
})
export class UserAppConfigComponent extends BaseAngularComponent {
  private appManager = inject(ApplicationManager);
  private sharedService = inject(SharedService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private el = inject(ElementRef);

  private _showDialog = false;

  @Input()
  set ShowDialog(value: boolean) {
    if (value !== this._showDialog) {
      this._showDialog = value;
    }
  }
  get ShowDialog(): boolean {
    return this._showDialog;
  }

  @Output() ShowDialogChange = new EventEmitter<boolean>();
  @Output() ConfigSaved = new EventEmitter<void>();

  AllApps: AppConfigItem[] = [];
  ActiveApps: AppConfigItem[] = [];
  AvailableApps: AppConfigItem[] = [];

  IsLoading = false;
  IsSaving = false;
  ErrorMessage = '';

  AvailablePanelCollapsed = false;
  SelectedPanelCollapsed = false;

  DraggedItem: AppConfigItem | null = null;
  DraggedIndex = -1;
  DropTargetIndex = -1;

  /**
   * Opens the dialog and loads user's app configuration
   */
  async Open(): Promise<void> {
    this._showDialog = true;
    this.ShowDialogChange.emit(true);
    this.ErrorMessage = '';
    await this.loadConfiguration();
  }

  /**
   * Closes the dialog without saving
   */
  Close(): void {
    this._showDialog = false;
    this.ShowDialogChange.emit(false);
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
   * Moves an app up in the order
   */
  MoveUp(item: AppConfigItem): void {
    const index = this.ActiveApps.indexOf(item);
    if (index > 0) {
      this.swapSequences(item, this.ActiveApps[index - 1]);
      this.ActiveApps = [...this.ActiveApps].sort((a, b) => a.sequence - b.sequence);
    }
  }

  /**
   * Moves an app down in the order
   */
  MoveDown(item: AppConfigItem): void {
    const index = this.ActiveApps.indexOf(item);
    if (index < this.ActiveApps.length - 1) {
      this.swapSequences(item, this.ActiveApps[index + 1]);
      this.ActiveApps = [...this.ActiveApps].sort((a, b) => a.sequence - b.sequence);
    }
  }

  /**
   * Checks if there are any unsaved changes
   */
  HasChanges(): boolean {
    return this.AllApps.some(item => item.isDirty);
  }

  /**
   * Saves the user's app configuration
   */
  async Save(): Promise<void> {
    if (!this.HasChanges()) {
      this.Close();
      return;
    }

    this.IsSaving = true;
    this.ErrorMessage = '';

    try {
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
      this.ConfigSaved.emit();
      this.Close();

    } catch (error) {
      this.ErrorMessage = 'Failed to save configuration. Please try again.';
      LogError('Error saving app configuration:', undefined, error instanceof Error ? error.message : String(error));
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

  OnDragStart(event: DragEvent, item: AppConfigItem, index: number): void {
    this.DraggedItem = item;
    this.DraggedIndex = index;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  OnDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  OnDragEnter(event: DragEvent, index: number): void {
    event.preventDefault();
    this.DropTargetIndex = index;
  }

  OnDragEnd(): void {
    this.DraggedItem = null;
    this.DraggedIndex = -1;
    this.DropTargetIndex = -1;
  }

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

  TouchDragIndex = -1;
  TouchDropIndex = -1;
  TouchDragActive = false;

  private touchStartY = 0;
  private touchCurrentY = 0;
  private touchRowHeight = 0;
  private touchDragElement: HTMLElement | null = null;
  private touchScrollContainer: HTMLElement | null = null;

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
      // need to re-query the DB on every dialog open. EnsureLoaded is idempotent
      // and instant when the engine is already loaded (the typical case here,
      // since UserInfoEngine fires at startup).
      await UserInfoEngine.Instance.EnsureLoaded();
      const systemApps = this.appManager.GetAuthorizedSystemApps();
      const userApps = UserInfoEngine.Instance.UserApplications;
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
    this.ActiveApps.forEach((item, index) => {
      if (item.sequence !== index) {
        item.sequence = index;
        item.isDirty = true;
      }
    });
  }

  private swapSequences(a: AppConfigItem, b: AppConfigItem): void {
    const tempSeq = a.sequence;
    a.sequence = b.sequence;
    b.sequence = tempSeq;
    a.isDirty = true;
    b.isDirty = true;
  }

  private async updateUserApplication(md: IMetadataProvider, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications');
    await userApp.Load(item.userAppId!);

    userApp.Sequence = item.sequence;
    userApp.IsActive = item.isActive;

    const saved = await userApp.Save();
    if (!saved) {
      throw new Error(`Failed to update UserApplication for ${item.app.Name}: ${userApp.LatestResult}`);
    }

    item.isDirty = false;
    LogStatus(`Updated UserApplication for ${item.app.Name}: sequence=${item.sequence}, isActive=${item.isActive}`);
  }

  private async createUserApplication(md: IMetadataProvider, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications');
    userApp.NewRecord();

    userApp.UserID = md.CurrentUser.ID;
    userApp.ApplicationID = item.app.ID;
    userApp.Sequence = item.sequence;
    userApp.IsActive = item.isActive;

    const saved = await userApp.Save();
    if (!saved) {
      throw new Error(`Failed to create UserApplication for ${item.app.Name}: ${userApp.LatestResult}`);
    }

    item.userAppId = userApp.ID;
    item.isDirty = false;
    LogStatus(`Created UserApplication for ${item.app.Name}: sequence=${item.sequence}`);
  }
}
