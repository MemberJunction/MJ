import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { UserAvatarService } from '@memberjunction/ng-user-avatar';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
interface IconCategory {
  name: string;
  icons: string[];
}

@Component({
  standalone: false,
  selector: 'mj-user-profile-settings',
  templateUrl: './user-profile-settings.component.html',
  styleUrls: ['./user-profile-settings.component.css']
})
export class UserProfileSettingsComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  CurrentUser!: MJUserEntity;

  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): MJUserEntity {
    return this.CurrentUser;
  }
  /** @deprecated Use {@link CurrentUser}. */
  set currentUser(value: MJUserEntity) {
    this.CurrentUser = value;
  }
  SelectedTab: 'upload' | 'url' | 'icon' | 'provider' = 'url';

  /** @deprecated Use {@link SelectedTab}. */
  get selectedTab(): 'upload' | 'url' | 'icon' | 'provider' {
    return this.SelectedTab;
  }
  /** @deprecated Use {@link SelectedTab}. */
  set selectedTab(value: 'upload' | 'url' | 'icon' | 'provider') {
    this.SelectedTab = value;
  }

  // Form state
  ImageUrlInput = '';

  /** @deprecated Use {@link ImageUrlInput}. */
  get imageUrlInput() {
    return this.ImageUrlInput;
  }
  /** @deprecated Use {@link ImageUrlInput}. */
  set imageUrlInput(value) {
    this.ImageUrlInput = value;
  }
  SelectedIconClass = '';

  /** @deprecated Use {@link SelectedIconClass}. */
  get selectedIconClass() {
    return this.SelectedIconClass;
  }
  /** @deprecated Use {@link SelectedIconClass}. */
  set selectedIconClass(value) {
    this.SelectedIconClass = value;
  }
  UploadedImageBase64 = '';

  /** @deprecated Use {@link UploadedImageBase64}. */
  get uploadedImageBase64() {
    return this.UploadedImageBase64;
  }
  /** @deprecated Use {@link UploadedImageBase64}. */
  set uploadedImageBase64(value) {
    this.UploadedImageBase64 = value;
  }
  UploadedFileName = '';

  /** @deprecated Use {@link UploadedFileName}. */
  get uploadedFileName() {
    return this.UploadedFileName;
  }
  /** @deprecated Use {@link UploadedFileName}. */
  set uploadedFileName(value) {
    this.UploadedFileName = value;
  }
  PreviewUrl = '';

  /** @deprecated Use {@link PreviewUrl}. */
  get previewUrl() {
    return this.PreviewUrl;
  }
  /** @deprecated Use {@link PreviewUrl}. */
  set previewUrl(value) {
    this.PreviewUrl = value;
  }
  PreviewIconClass = '';

  /** @deprecated Use {@link PreviewIconClass}. */
  get previewIconClass() {
    return this.PreviewIconClass;
  }
  /** @deprecated Use {@link PreviewIconClass}. */
  set previewIconClass(value) {
    this.PreviewIconClass = value;
  }

  // UI state
  IsSaving = false;

  /** @deprecated Use {@link IsSaving}. */
  get isSaving() {
    return this.IsSaving;
  }
  /** @deprecated Use {@link IsSaving}. */
  set isSaving(value) {
    this.IsSaving = value;
  }
  ShowSuccessMessage = false;

  /** @deprecated Use {@link ShowSuccessMessage}. */
  get showSuccessMessage() {
    return this.ShowSuccessMessage;
  }
  /** @deprecated Use {@link ShowSuccessMessage}. */
  set showSuccessMessage(value) {
    this.ShowSuccessMessage = value;
  }
  errorMessage = '';

  // Icon search state
  IconSearchTerm = '';

  /** @deprecated Use {@link IconSearchTerm}. */
  get iconSearchTerm() {
    return this.IconSearchTerm;
  }
  /** @deprecated Use {@link IconSearchTerm}. */
  set iconSearchTerm(value) {
    this.IconSearchTerm = value;
  }
  IconSearch$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link IconSearch$}. */
  get iconSearch$() {
    return this.IconSearch$;
  }
  /** @deprecated Use {@link IconSearch$}. */
  set iconSearch$(value) {
    this.IconSearch$ = value;
  }
  FilteredIconCategories: IconCategory[] = [];

  /** @deprecated Use {@link FilteredIconCategories}. */
  get filteredIconCategories(): IconCategory[] {
    return this.FilteredIconCategories;
  }
  /** @deprecated Use {@link FilteredIconCategories}. */
  set filteredIconCategories(value: IconCategory[]) {
    this.FilteredIconCategories = value;
  }
  TotalFilteredIcons = 0;

  /** @deprecated Use {@link TotalFilteredIcons}. */
  get totalFilteredIcons() {
    return this.TotalFilteredIcons;
  }
  /** @deprecated Use {@link TotalFilteredIcons}. */
  set totalFilteredIcons(value) {
    this.TotalFilteredIcons = value;
  }

  // Cleanup
  private destroy$ = new Subject<void>();

  // Icon picker data
  IconCategories: IconCategory[] = [
    {
      name: 'Users',
      icons: [
        'fa-solid fa-user',
        'fa-solid fa-user-tie',
        'fa-solid fa-user-astronaut',
        'fa-solid fa-user-ninja',
        'fa-solid fa-user-secret',
        'fa-solid fa-user-graduate',
        'fa-solid fa-user-doctor',
        'fa-solid fa-user-gear',
        'fa-regular fa-circle-user',
        'fa-solid fa-user-check',
        'fa-solid fa-user-shield',
        'fa-solid fa-user-crown',
        'fa-solid fa-user-pilot',
        'fa-solid fa-user-cowboy',
        'fa-solid fa-user-chef'
      ]
    },
    {
      name: 'Business',
      icons: [
        'fa-solid fa-briefcase',
        'fa-solid fa-building',
        'fa-solid fa-chart-line',
        'fa-solid fa-handshake',
        'fa-solid fa-trophy',
        'fa-solid fa-medal',
        'fa-solid fa-award',
        'fa-solid fa-lightbulb',
        'fa-solid fa-rocket',
        'fa-solid fa-star'
      ]
    },
    {
      name: 'Tech',
      icons: [
        'fa-solid fa-laptop-code',
        'fa-solid fa-terminal',
        'fa-solid fa-microchip',
        'fa-solid fa-robot',
        'fa-solid fa-brain',
        'fa-solid fa-code',
        'fa-solid fa-server',
        'fa-solid fa-database',
        'fa-solid fa-network-wired',
        'fa-solid fa-bug'
      ]
    },
    {
      name: 'Fun',
      icons: [
        'fa-solid fa-face-smile',
        'fa-solid fa-face-grin',
        'fa-solid fa-face-laugh',
        'fa-solid fa-face-wink',
        'fa-solid fa-heart',
        'fa-solid fa-fire',
        'fa-solid fa-bolt',
        'fa-solid fa-gem',
        'fa-solid fa-crown',
        'fa-solid fa-hat-wizard'
      ]
    },
    {
      name: 'Animals',
      icons: [
        'fa-solid fa-cat',
        'fa-solid fa-dog',
        'fa-solid fa-dragon',
        'fa-solid fa-dove',
        'fa-solid fa-fish'
      ]
    }
  ];

  /** @deprecated Use {@link IconCategories}. */
  get iconCategories(): IconCategory[] {
    return this.IconCategories;
  }
  /** @deprecated Use {@link IconCategories}. */
  set iconCategories(value: IconCategory[]) {
    this.IconCategories = value;
  }

  constructor(
    private userAvatarService: UserAvatarService,
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    super();}

  async ngOnInit() {
    const md = this.ProviderToUse;
    const currentUserInfo = md.CurrentUser;

    // Load the full MJUserEntity to access avatar fields
    this.CurrentUser = await md.GetEntityObject<MJUserEntity>('MJ: Users');
    await this.CurrentUser.Load(currentUserInfo.ID);

    // Initialize filtered icons
    this.FilteredIconCategories = [...this.IconCategories];
    this.TotalFilteredIcons = this.IconCategories.reduce(
      (sum, cat) => sum + cat.icons.length,
      0
    );

    // Setup icon search subscription
    this.setupIconSearchSubscription();

    this.loadCurrentAvatar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initializes the icon search subscription with debounce
   */
  private setupIconSearchSubscription(): void {
    this.IconSearch$
      .pipe(
        debounceTime(200), // Faster debounce for local filtering
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((searchTerm) => {
        this.filterIcons(searchTerm);
      });
  }

  /**
   * Handles icon search input changes
   */
  OnIconSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.IconSearchTerm = value;
    this.IconSearch$.next(value);
  }

  /** @deprecated Use {@link OnIconSearchChange}. */
  onIconSearchChange(event: Event): void {
    return this.OnIconSearchChange(event);
  }

  /**
   * Filters icons based on search term
   * Matches icon class name parts (e.g., "user" matches "fa-user-tie")
   */
  private filterIcons(searchTerm: string): void {
    if (!searchTerm || searchTerm.trim() === '') {
      // Show all icons
      this.FilteredIconCategories = [...this.IconCategories];
      this.TotalFilteredIcons = this.IconCategories.reduce(
        (sum, cat) => sum + cat.icons.length,
        0
      );
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    this.FilteredIconCategories = [];
    this.TotalFilteredIcons = 0;

    for (const category of this.IconCategories) {
      const matchingIcons = category.icons.filter((icon) => {
        // Extract icon name from class (e.g., "fa-solid fa-user-tie" -> "user-tie")
        const iconName = this.ExtractIconName(icon);
        return iconName.includes(term);
      });

      if (matchingIcons.length > 0) {
        this.FilteredIconCategories.push({
          name: category.name,
          icons: matchingIcons
        });
        this.TotalFilteredIcons += matchingIcons.length;
      }
    }
  }

  /**
   * Extracts the icon name from a Font Awesome class string
   * e.g., "fa-solid fa-user-tie" -> "user-tie"
   */
  ExtractIconName(iconClass: string): string {
    const parts = iconClass.split(' ');
    for (const part of parts) {
      if (part.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-light', 'fa-brands'].includes(part)) {
        return part.substring(3); // Remove "fa-" prefix
      }
    }
    return iconClass.toLowerCase();
  }

  /** @deprecated Use {@link ExtractIconName}. */
  extractIconName(iconClass: string): string {
    return this.ExtractIconName(iconClass);
  }

  /**
   * Clears the icon search
   */
  ClearIconSearch(): void {
    this.IconSearchTerm = '';
    this.IconSearch$.next('');
  }

  /** @deprecated Use {@link ClearIconSearch}. */
  clearIconSearch(): void {
    return this.ClearIconSearch();
  }

  /**
   * Loads the current avatar settings from the user entity
   */
  private loadCurrentAvatar(): void {
    if (this.CurrentUser.UserImageURL) {
      this.ImageUrlInput = this.CurrentUser.UserImageURL;
      this.PreviewUrl = this.CurrentUser.UserImageURL;

      // Determine if it's a Base64 upload or URL
      if (this.userAvatarService.isValidBase64DataUri(this.CurrentUser.UserImageURL)) {
        this.SelectedTab = 'upload';
        this.UploadedImageBase64 = this.CurrentUser.UserImageURL;
        this.UploadedFileName = 'Current uploaded image';
      } else {
        this.SelectedTab = 'url';
      }
    } else if (this.CurrentUser.UserImageIconClass) {
      this.SelectedIconClass = this.CurrentUser.UserImageIconClass;
      this.PreviewIconClass = this.CurrentUser.UserImageIconClass;
      this.SelectedTab = 'icon';
    } else {
      // Default to URL tab with empty state
      this.SelectedTab = 'url';
    }
  }

  /**
   * Switches between tabs and updates preview
   */
  SelectTab(tab: 'upload' | 'url' | 'icon' | 'provider'): void {
    this.SelectedTab = tab;
    this.updatePreview();
  }

  /** @deprecated Use {@link SelectTab}. */
  selectTab(tab: 'upload' | 'url' | 'icon' | 'provider'): void {
    return this.SelectTab(tab);
  }

  /**
   * Handles file selection from native input
   */
  async OnFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    // Clear any previous errors
    this.errorMessage = '';

    // Validate file type
    if (!file.type.match(/^image\/(png|jpeg|jpg|gif|webp)$/)) {
      this.errorMessage = 'Please select a valid image file (PNG, JPG, GIF, WEBP)';
      input.value = ''; // Clear the input
      return;
    }

    // Validate file size (200KB)
    const maxSize = 200 * 1024;
    if (file.size > maxSize) {
      this.errorMessage = `Image must be smaller than 200KB. Your image is ${Math.round(file.size / 1024)}KB`;
      input.value = ''; // Clear the input
      return;
    }

    // Convert to Base64
    try {
      this.UploadedImageBase64 = await this.userAvatarService.fileToBase64(file);
      this.UploadedFileName = file.name;
      this.PreviewUrl = this.UploadedImageBase64;
      this.PreviewIconClass = ''; // Clear icon preview
    } catch (error) {
      this.errorMessage = 'Failed to process image. Please try again.';
      console.error('Error converting file to Base64:', error);
    }
  }

  /** @deprecated Use {@link OnFileSelected}. */
  async onFileSelected(event: Event): Promise<void> {
    return this.OnFileSelected(event);
  }

  /**
   * Clears uploaded file
   */
  ClearUpload(): void {
    this.UploadedFileName = '';
    this.UploadedImageBase64 = '';
    this.PreviewUrl = '';
    this.errorMessage = '';

    // Reset file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  /** @deprecated Use {@link ClearUpload}. */
  clearUpload(): void {
    return this.ClearUpload();
  }

  /**
   * Handles URL input changes
   */
  OnUrlChange(): void {
    this.errorMessage = '';

    if (this.ImageUrlInput && this.ImageUrlInput.trim().length > 0) {
      if (this.userAvatarService.isValidUrl(this.ImageUrlInput)) {
        this.PreviewUrl = this.ImageUrlInput;
        this.PreviewIconClass = ''; // Clear icon preview
      } else {
        this.errorMessage = 'Please enter a valid URL';
        this.PreviewUrl = '';
      }
    } else {
      this.PreviewUrl = '';
    }
  }

  /** @deprecated Use {@link OnUrlChange}. */
  onUrlChange(): void {
    return this.OnUrlChange();
  }

  /**
   * Handles icon selection
   */
  SelectIcon(iconClass: string): void {
    this.SelectedIconClass = iconClass;
    this.PreviewIconClass = iconClass;
    this.PreviewUrl = ''; // Clear image preview
    this.errorMessage = '';
  }

  /** @deprecated Use {@link SelectIcon}. */
  selectIcon(iconClass: string): void {
    return this.SelectIcon(iconClass);
  }

  /**
   * Checks if an icon is currently selected
   */
  IsIconSelected(iconClass: string): boolean {
    return this.SelectedIconClass === iconClass;
  }

  /** @deprecated Use {@link IsIconSelected}. */
  isIconSelected(iconClass: string): boolean {
    return this.IsIconSelected(iconClass);
  }

  /**
   * Syncs avatar from authentication provider
   * NOTE: This is a placeholder - actual implementation should be done
   * in the calling application which has access to auth services
   */
  async SyncFromProvider(): Promise<void> {
    this.errorMessage = 'Avatar sync from provider is not yet implemented in settings. Please use the automatic sync on login or manually upload an image.';
    // TODO: Implement auth provider integration
    // The calling application should provide a way to get auth claims
    // and call userAvatarService.syncFromImageUrl() with the appropriate URL and headers
  }

  /** @deprecated Use {@link SyncFromProvider}. */
  async syncFromProvider(): Promise<void> {
    return this.SyncFromProvider();
  }

  /**
   * Reverts avatar to default (clears both fields)
   * This will trigger auto-sync from auth provider on next login
   */
  async RevertToDefault(): Promise<void> {
    this.IsSaving = true;
    this.errorMessage = '';
    this.ShowSuccessMessage = false;

    try {
      // Clear both avatar fields
      this.CurrentUser.UserImageURL = null;
      this.CurrentUser.UserImageIconClass = null;

      // Save to database
      const saved = await this.CurrentUser.Save();

      if (saved) {
        // Clear local state
        this.ImageUrlInput = '';
        this.SelectedIconClass = '';
        this.UploadedImageBase64 = '';
        this.UploadedFileName = '';
        this.PreviewUrl = '';
        this.PreviewIconClass = '';

        this.showSuccess('Avatar reverted to default! Your auth provider image will sync on next login.');

        // Notify header component to update avatar display
        MJGlobal.Instance.RaiseEvent({
          event: MJEventType.ComponentEvent,
          eventCode: EventCodes.AvatarUpdated,
          component: this,
          args: {
            imageUrl: null,
            iconClass: null
          }
        });
      } else {
        this.errorMessage = 'Failed to revert avatar. Please try again.';
      }
    } catch (error) {
      console.error('Error reverting avatar:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'An error occurred while reverting. Please try again.';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.IsSaving = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link RevertToDefault}. */
  async revertToDefault(): Promise<void> {
    return this.RevertToDefault();
  }

  /**
   * Updates the preview based on current tab
   */
  private updatePreview(): void {
    switch (this.SelectedTab) {
      case 'upload':
        if (this.UploadedImageBase64) {
          this.PreviewUrl = this.UploadedImageBase64;
          this.PreviewIconClass = '';
        }
        break;
      case 'url':
        if (this.ImageUrlInput && this.userAvatarService.isValidUrl(this.ImageUrlInput)) {
          this.PreviewUrl = this.ImageUrlInput;
          this.PreviewIconClass = '';
        }
        break;
      case 'icon':
        if (this.SelectedIconClass) {
          this.PreviewIconClass = this.SelectedIconClass;
          this.PreviewUrl = '';
        }
        break;
    }
  }

  /**
   * Saves avatar settings to database
   */
  async save(): Promise<void> {
    this.IsSaving = true;
    this.errorMessage = '';
    this.ShowSuccessMessage = false;

    try {
      // Update user entity based on selected tab
      switch (this.SelectedTab) {
        case 'upload':
          if (!this.UploadedImageBase64) {
            this.errorMessage = 'Please select an image to upload';
            this.IsSaving = false;
            return;
          }
          this.CurrentUser.UserImageURL = this.UploadedImageBase64;
          this.CurrentUser.UserImageIconClass = null;
          break;

        case 'url':
          if (!this.ImageUrlInput || !this.userAvatarService.isValidUrl(this.ImageUrlInput)) {
            this.errorMessage = 'Please enter a valid image URL';
            this.IsSaving = false;
            return;
          }
          this.CurrentUser.UserImageURL = this.ImageUrlInput;
          this.CurrentUser.UserImageIconClass = null;
          break;

        case 'icon':
          if (!this.SelectedIconClass) {
            this.errorMessage = 'Please select an icon';
            this.IsSaving = false;
            return;
          }
          this.CurrentUser.UserImageURL = null;
          this.CurrentUser.UserImageIconClass = this.SelectedIconClass;
          break;
      }

      // Save to database
      const saved = await this.CurrentUser.Save();

      if (saved) {
        this.showSuccess('Avatar updated successfully!');

        // Notify header component to update avatar display
        MJGlobal.Instance.RaiseEvent({
          event: MJEventType.ComponentEvent,
          eventCode: EventCodes.AvatarUpdated,
          component: this,
          args: {
            imageUrl: this.CurrentUser.UserImageURL,
            iconClass: this.CurrentUser.UserImageIconClass
          }
        });
      } else {
        this.errorMessage = 'Failed to save avatar. Please try again.';
      }
    } catch (error) {
      console.error('Error saving avatar:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'An error occurred while saving. Please try again.';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.IsSaving = false;
        this.cdr.markForCheck();
      });
    }
  }

  /**
   * Cancels changes and reverts to saved state
   */
  cancel(): void {
    this.loadCurrentAvatar();
    this.errorMessage = '';
    this.ShowSuccessMessage = false;
  }

  /**
   * Shows success message temporarily
   */
  private showSuccess(message: string): void {
    this.ShowSuccessMessage = true;
    this.sharedService.CreateSimpleNotification(message, 'success', 3000);

    // Hide success message after 3 seconds
    setTimeout(() => {
      this.ShowSuccessMessage = false;
    }, 3000);
  }
}
