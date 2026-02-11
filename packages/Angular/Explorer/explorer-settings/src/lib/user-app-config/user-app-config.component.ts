import { Component, Input, Output, EventEmitter, ChangeDetectorRef, NgZone } from '@angular/core';
import { Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import { ApplicationEntity, UserApplicationEntity } from '@memberjunction/core-entities';
import { ApplicationManager, BaseApplication, UserAppConfig } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';

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
 * - Reorder applications via drag-and-drop
 */
@Component({
  standalone: false,
  selector: 'mj-user-app-config',
  templateUrl: './user-app-config.component.html',
  styleUrls: ['./user-app-config.component.css']
})
export class UserAppConfigComponent {
  @Input() showDialog = false;
  @Output() showDialogChange = new EventEmitter<boolean>();
  @Output() configSaved = new EventEmitter<void>();

  // All available apps from the system
  allApps: AppConfigItem[] = [];

  // User's selected apps (active and ordered)
  activeApps: AppConfigItem[] = [];

  // Available apps not yet selected
  availableApps: AppConfigItem[] = [];

  isLoading = false;
  isSaving = false;
  errorMessage = '';

  // Panel collapse state (for mobile)
  availablePanelCollapsed = false;
  selectedPanelCollapsed = false;

  // Native drag-and-drop state
  draggedItem: AppConfigItem | null = null;
  draggedIndex = -1;
  dropTargetIndex = -1;

  constructor(
    private appManager: ApplicationManager,
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  /**
   * Opens the dialog and loads user's app configuration
   */
  async open(): Promise<void> {
    this.showDialog = true;
    this.showDialogChange.emit(true);
    this.errorMessage = '';
    await this.loadConfiguration();
  }

  /**
   * Closes the dialog without saving
   */
  close(): void {
    this.showDialog = false;
    this.showDialogChange.emit(false);
  }

  /**
   * Loads the user's current app configuration
   */
  private async loadConfiguration(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

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
      this.allApps = this.buildAppConfigItems(systemApps, userApps);

      // Separate into active (selected) and available (unselected)
      this.refreshAppLists();

    } catch (error) {
      this.errorMessage = 'Failed to load app configuration. Please try again.';
      LogError('Error loading app configuration:', undefined, error instanceof Error ? error.message : String(error));
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Builds app config items by matching system apps with user's UserApplication records
   */
  private buildAppConfigItems(systemApps: BaseApplication[], userApps: UserApplicationEntity[]): AppConfigItem[] {
    const items: AppConfigItem[] = [];

    for (const app of systemApps) {
      const userApp = userApps.find(ua => ua.ApplicationID === app.ID);

      items.push({
        app,
        userAppId: userApp?.ID || null,
        sequence: userApp?.Sequence ?? 999, // Default high sequence for unselected
        isActive: userApp?.IsActive ?? false,
        isDirty: false
      });
    }

    return items;
  }

  /**
   * Separates apps into active and available lists based on isActive state
   */
  private refreshAppLists(): void {
    this.activeApps = this.allApps
      .filter(item => item.isActive)
      .sort((a, b) => a.sequence - b.sequence);

    this.availableApps = this.allApps
      .filter(item => !item.isActive)
      .sort((a, b) => a.app.Name.localeCompare(b.app.Name));
  }

  /**
   * Native drag start handler
   */
  onDragStart(event: DragEvent, item: AppConfigItem, index: number): void {
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
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Native drag enter handler - tracks drop target
   */
  onDragEnter(event: DragEvent, index: number): void {
    event.preventDefault();
    this.dropTargetIndex = index;
  }

  /**
   * Native drag end handler - cleanup
   */
  onDragEnd(event: DragEvent): void {
    this.draggedItem = null;
    this.draggedIndex = -1;
    this.dropTargetIndex = -1;
  }

  /**
   * Native drop handler - reorder items
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();

    if (this.draggedIndex >= 0 && this.dropTargetIndex >= 0 && this.draggedIndex !== this.dropTargetIndex) {
      // Remove item from old position
      const [movedItem] = this.activeApps.splice(this.draggedIndex, 1);

      // Insert at new position
      this.activeApps.splice(this.dropTargetIndex, 0, movedItem);

      // Update sequences based on new order
      this.activeApps.forEach((item, idx) => {
        if (item.sequence !== idx) {
          item.sequence = idx;
          item.isDirty = true;
        }
      });

      this.cdr.detectChanges();
    }

    // Reset drag state
    this.draggedItem = null;
    this.draggedIndex = -1;
    this.dropTargetIndex = -1;
  }

  /**
   * Adds an app to the user's active list
   */
  addApp(item: AppConfigItem): void {
    item.isActive = true;
    item.sequence = this.activeApps.length;
    item.isDirty = true;
    this.refreshAppLists();
  }

  /**
   * Removes an app from the user's active list
   */
  removeApp(item: AppConfigItem): void {
    item.isActive = false;
    item.sequence = 999;
    item.isDirty = true;
    this.refreshAppLists();

    // Resequence remaining active apps
    this.activeApps.forEach((activeItem, index) => {
      if (activeItem.sequence !== index) {
        activeItem.sequence = index;
        activeItem.isDirty = true;
      }
    });
  }

  /**
   * Moves an app up in the order
   */
  moveUp(item: AppConfigItem): void {
    const index = this.activeApps.indexOf(item);
    if (index > 0) {
      // Swap with previous item
      const prevItem = this.activeApps[index - 1];

      // Swap sequences
      const tempSeq = item.sequence;
      item.sequence = prevItem.sequence;
      prevItem.sequence = tempSeq;

      item.isDirty = true;
      prevItem.isDirty = true;

      // Re-sort and create new array reference to trigger change detection
      this.activeApps = [...this.activeApps].sort((a, b) => a.sequence - b.sequence);
    }
  }

  /**
   * Moves an app down in the order
   */
  moveDown(item: AppConfigItem): void {
    const index = this.activeApps.indexOf(item);
    if (index < this.activeApps.length - 1) {
      // Swap with next item
      const nextItem = this.activeApps[index + 1];

      // Swap sequences
      const tempSeq = item.sequence;
      item.sequence = nextItem.sequence;
      nextItem.sequence = tempSeq;

      item.isDirty = true;
      nextItem.isDirty = true;

      // Re-sort and create new array reference to trigger change detection
      this.activeApps = [...this.activeApps].sort((a, b) => a.sequence - b.sequence);
    }
  }

  /**
   * Checks if there are any unsaved changes
   */
  hasChanges(): boolean {
    return this.allApps.some(item => item.isDirty);
  }

  /**
   * Saves the user's app configuration
   */
  async save(): Promise<void> {
    if (!this.hasChanges()) {
      this.close();
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      const md = new Metadata();
      const rv = new RunView();

      // Process each app config item
      for (const item of this.allApps) {
        if (!item.isDirty) continue;

        if (item.userAppId) {
          // Update existing UserApplication record
          await this.updateUserApplication(md, item);
        } else if (item.isActive) {
          // Create new UserApplication record (only if active)
          await this.createUserApplication(md, item);
        }
        // If not active and no existing record, nothing to do
      }

      // Reload the ApplicationManager to reflect changes
      LogStatus('User app configuration saved, reloading ApplicationManager...');
      await this.appManager.ReloadUserApplications();

      this.sharedService.CreateSimpleNotification('App configuration saved successfully!', 'success', 3000);
      this.configSaved.emit();
      this.close();

    } catch (error) {
      this.errorMessage = 'Failed to save configuration. Please try again.';
      LogError('Error saving app configuration:', undefined, error instanceof Error ? error.message : String(error));
    } finally {
      this.ngZone.run(() => {
        this.isSaving = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Updates an existing UserApplication record
   */
  private async updateUserApplication(md: Metadata, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications');
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

  /**
   * Creates a new UserApplication record
   */
  private async createUserApplication(md: Metadata, item: AppConfigItem): Promise<void> {
    const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications');
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

  /**
   * Resets all changes and reloads the configuration
   */
  async reset(): Promise<void> {
    await this.loadConfiguration();
  }
}
