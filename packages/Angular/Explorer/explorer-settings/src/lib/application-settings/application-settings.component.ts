import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import { UserApplicationEntity } from '@memberjunction/core-entities';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';

/**
 * Represents an app item in the configuration UI
 */
interface AppConfigItem {
  App: BaseApplication;
  UserAppId: string | null;
  Sequence: number;
  IsActive: boolean;
  IsDirty: boolean;
}

/**
 * Inline component for configuring user's application visibility and order.
 * Allows users to:
 * - Select which applications to show in the app switcher
 * - Reorder applications via drag-and-drop
 */
@Component({
  standalone: false,
  selector: 'mj-application-settings',
  templateUrl: './application-settings.component.html',
  styleUrls: ['./application-settings.component.css']
})
export class ApplicationSettingsComponent implements OnInit {
  // All available apps from the system
  AllApps: AppConfigItem[] = [];

  // User's selected apps (active and ordered)
  ActiveApps: AppConfigItem[] = [];

  // Available apps not yet selected
  AvailableApps: AppConfigItem[] = [];

  IsLoading = false;
  IsSaving = false;
  ErrorMessage = '';
  SuccessMessage = '';

  // Native drag-and-drop state
  private draggedItem: AppConfigItem | null = null;
  private draggedIndex = -1;
  private dropTargetIndex = -1;

  constructor(
    private appManager: ApplicationManager,
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  async ngOnInit(): Promise<void> {
    await this.LoadConfiguration();
  }

  /**
   * Loads the user's current app configuration
   */
  async LoadConfiguration(): Promise<void> {
    this.IsLoading = true;
    this.ErrorMessage = '';

    try {
      const md = new Metadata();
      const rv = new RunView();

      // Load all system apps from ApplicationManager
      const systemApps = this.appManager.GetAllSystemApps();

      // Load user's UserApplication records
      const userAppsResult = await rv.RunView<UserApplicationEntity>({
        EntityName: 'User Applications',
        ExtraFilter: `UserID = '${md.CurrentUser.ID}'`,
        OrderBy: 'Sequence, Application',
        ResultType: 'entity_object'
      });

      const userApps: UserApplicationEntity[] = userAppsResult.Success ? userAppsResult.Results : [];

      // Build app config items
      this.AllApps = this.BuildAppConfigItems(systemApps, userApps);

      // Separate into active (selected) and available (unselected)
      this.RefreshAppLists();

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

  /**
   * Builds app config items by matching system apps with user's UserApplication records
   */
  private BuildAppConfigItems(systemApps: BaseApplication[], userApps: UserApplicationEntity[]): AppConfigItem[] {
    const items: AppConfigItem[] = [];

    for (const app of systemApps) {
      const userApp = userApps.find(ua => ua.ApplicationID === app.ID);

      items.push({
        App: app,
        UserAppId: userApp?.ID || null,
        Sequence: userApp?.Sequence ?? 999,
        IsActive: userApp?.IsActive ?? false,
        IsDirty: false
      });
    }

    return items;
  }

  /**
   * Separates apps into active and available lists based on IsActive state
   */
  private RefreshAppLists(): void {
    this.ActiveApps = this.AllApps
      .filter(item => item.IsActive)
      .sort((a, b) => a.Sequence - b.Sequence);

    this.AvailableApps = this.AllApps
      .filter(item => !item.IsActive)
      .sort((a, b) => a.App.Name.localeCompare(b.App.Name));
  }

  /**
   * Native drag start handler
   */
  OnDragStart(event: DragEvent, item: AppConfigItem, index: number): void {
    this.draggedItem = item;
    this.draggedIndex = index;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  /**
   * Native drag over handler - allows drop
   */
  OnDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Native drag enter handler - tracks drop target
   */
  OnDragEnter(event: DragEvent, index: number): void {
    event.preventDefault();
    this.dropTargetIndex = index;
  }

  /**
   * Native drag end handler - cleanup
   */
  OnDragEnd(): void {
    this.draggedItem = null;
    this.draggedIndex = -1;
    this.dropTargetIndex = -1;
  }

  /**
   * Native drop handler - reorder items
   */
  OnDrop(event: DragEvent): void {
    event.preventDefault();

    if (this.draggedIndex >= 0 && this.dropTargetIndex >= 0 && this.draggedIndex !== this.dropTargetIndex) {
      // Remove item from old position
      const [movedItem] = this.ActiveApps.splice(this.draggedIndex, 1);

      // Insert at new position
      this.ActiveApps.splice(this.dropTargetIndex, 0, movedItem);

      // Update sequences based on new order
      this.ActiveApps.forEach((item, idx) => {
        if (item.Sequence !== idx) {
          item.Sequence = idx;
          item.IsDirty = true;
        }
      });

      this.cdr.detectChanges();
    }

    // Reset drag state
    this.OnDragEnd();
  }

  /**
   * Adds an app to the user's active list
   */
  AddApp(item: AppConfigItem): void {
    item.IsActive = true;
    item.Sequence = this.ActiveApps.length;
    item.IsDirty = true;
    this.RefreshAppLists();
  }

  /**
   * Removes an app from the user's active list
   */
  RemoveApp(item: AppConfigItem): void {
    item.IsActive = false;
    item.Sequence = 999;
    item.IsDirty = true;
    this.RefreshAppLists();

    // Resequence remaining active apps
    this.ActiveApps.forEach((activeItem, index) => {
      if (activeItem.Sequence !== index) {
        activeItem.Sequence = index;
        activeItem.IsDirty = true;
      }
    });
  }

  /**
   * Moves an app up in the order
   */
  MoveUp(item: AppConfigItem): void {
    const index = this.ActiveApps.indexOf(item);
    if (index > 0) {
      const prevItem = this.ActiveApps[index - 1];

      // Swap sequences
      const tempSeq = item.Sequence;
      item.Sequence = prevItem.Sequence;
      prevItem.Sequence = tempSeq;

      item.IsDirty = true;
      prevItem.IsDirty = true;

      // Re-sort
      this.ActiveApps = [...this.ActiveApps].sort((a, b) => a.Sequence - b.Sequence);
    }
  }

  /**
   * Moves an app down in the order
   */
  MoveDown(item: AppConfigItem): void {
    const index = this.ActiveApps.indexOf(item);
    if (index < this.ActiveApps.length - 1) {
      const nextItem = this.ActiveApps[index + 1];

      // Swap sequences
      const tempSeq = item.Sequence;
      item.Sequence = nextItem.Sequence;
      nextItem.Sequence = tempSeq;

      item.IsDirty = true;
      nextItem.IsDirty = true;

      // Re-sort
      this.ActiveApps = [...this.ActiveApps].sort((a, b) => a.Sequence - b.Sequence);
    }
  }

  /**
   * Checks if there are any unsaved changes
   */
  HasChanges(): boolean {
    return this.AllApps.some(item => item.IsDirty);
  }

  /**
   * Saves the user's app configuration
   */
  async Save(): Promise<void> {
    if (!this.HasChanges()) {
      return;
    }

    this.IsSaving = true;
    this.ErrorMessage = '';
    this.SuccessMessage = '';

    try {
      const md = new Metadata();

      // Process each app config item
      for (const item of this.AllApps) {
        if (!item.IsDirty) continue;

        if (item.UserAppId) {
          // Update existing UserApplication record
          await this.UpdateUserApplication(md, item);
        } else if (item.IsActive) {
          // Create new UserApplication record (only if active)
          await this.CreateUserApplication(md, item);
        }
      }

      // Reload the ApplicationManager to reflect changes
      LogStatus('User app configuration saved, reloading ApplicationManager...');
      await this.appManager.ReloadUserApplications();

      this.SuccessMessage = 'App configuration saved successfully!';
      this.sharedService.CreateSimpleNotification(this.SuccessMessage, 'success', 3000);

      // Clear dirty flags
      this.AllApps.forEach(item => item.IsDirty = false);

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
   * Updates an existing UserApplication record
   */
  private async UpdateUserApplication(md: Metadata, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications');
    await userApp.Load(item.UserAppId!);

    userApp.Sequence = item.Sequence;
    userApp.IsActive = item.IsActive;

    const saved = await userApp.Save();
    if (!saved) {
      throw new Error(`Failed to update UserApplication for ${item.App.Name}: ${userApp.LatestResult}`);
    }

    item.IsDirty = false;
    LogStatus(`Updated UserApplication for ${item.App.Name}: sequence=${item.Sequence}, isActive=${item.IsActive}`);
  }

  /**
   * Creates a new UserApplication record
   */
  private async CreateUserApplication(md: Metadata, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications');
    userApp.NewRecord();

    userApp.UserID = md.CurrentUser.ID;
    userApp.ApplicationID = item.App.ID;
    userApp.Sequence = item.Sequence;
    userApp.IsActive = item.IsActive;

    const saved = await userApp.Save();
    if (!saved) {
      throw new Error(`Failed to create UserApplication for ${item.App.Name}: ${userApp.LatestResult}`);
    }

    item.UserAppId = userApp.ID;
    item.IsDirty = false;
    LogStatus(`Created UserApplication for ${item.App.Name}: sequence=${item.Sequence}`);
  }

  /**
   * Resets all changes and reloads the configuration
   */
  async Reset(): Promise<void> {
    await this.LoadConfiguration();
    this.SuccessMessage = '';
  }

  /**
   * Check if drop target is active
   */
  IsDropTarget(index: number): boolean {
    return this.dropTargetIndex === index;
  }
}
