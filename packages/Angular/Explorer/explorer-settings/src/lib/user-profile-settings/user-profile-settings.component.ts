import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';
import { UserAvatarService } from '@memberjunction/ng-user-avatar';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

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
export class UserProfileSettingsComponent implements OnInit, OnDestroy {
  currentUser!: UserEntity;
  selectedTab: 'upload' | 'url' | 'icon' | 'provider' = 'url';

  // Form state
  imageUrlInput = '';
  selectedIconClass = '';
  uploadedImageBase64 = '';
  uploadedFileName = '';
  previewUrl = '';
  previewIconClass = '';

  // UI state
  isSaving = false;
  showSuccessMessage = false;
  errorMessage = '';

  // Icon search state
  iconSearchTerm = '';
  iconSearch$ = new BehaviorSubject<string>('');
  filteredIconCategories: IconCategory[] = [];
  totalFilteredIcons = 0;

  // Cleanup
  private destroy$ = new Subject<void>();

  // Icon picker data
  iconCategories: IconCategory[] = [
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

  constructor(
    private userAvatarService: UserAvatarService,
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    const md = new Metadata();
    const currentUserInfo = md.CurrentUser;

    // Load the full UserEntity to access avatar fields
    this.currentUser = await md.GetEntityObject<UserEntity>('Users');
    await this.currentUser.Load(currentUserInfo.ID);

    // Initialize filtered icons
    this.filteredIconCategories = [...this.iconCategories];
    this.totalFilteredIcons = this.iconCategories.reduce(
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
    this.iconSearch$
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
  onIconSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.iconSearchTerm = value;
    this.iconSearch$.next(value);
  }

  /**
   * Filters icons based on search term
   * Matches icon class name parts (e.g., "user" matches "fa-user-tie")
   */
  private filterIcons(searchTerm: string): void {
    if (!searchTerm || searchTerm.trim() === '') {
      // Show all icons
      this.filteredIconCategories = [...this.iconCategories];
      this.totalFilteredIcons = this.iconCategories.reduce(
        (sum, cat) => sum + cat.icons.length,
        0
      );
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    this.filteredIconCategories = [];
    this.totalFilteredIcons = 0;

    for (const category of this.iconCategories) {
      const matchingIcons = category.icons.filter((icon) => {
        // Extract icon name from class (e.g., "fa-solid fa-user-tie" -> "user-tie")
        const iconName = this.extractIconName(icon);
        return iconName.includes(term);
      });

      if (matchingIcons.length > 0) {
        this.filteredIconCategories.push({
          name: category.name,
          icons: matchingIcons
        });
        this.totalFilteredIcons += matchingIcons.length;
      }
    }
  }

  /**
   * Extracts the icon name from a Font Awesome class string
   * e.g., "fa-solid fa-user-tie" -> "user-tie"
   */
  extractIconName(iconClass: string): string {
    const parts = iconClass.split(' ');
    for (const part of parts) {
      if (part.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-light', 'fa-brands'].includes(part)) {
        return part.substring(3); // Remove "fa-" prefix
      }
    }
    return iconClass.toLowerCase();
  }

  /**
   * Clears the icon search
   */
  clearIconSearch(): void {
    this.iconSearchTerm = '';
    this.iconSearch$.next('');
  }

  /**
   * Loads the current avatar settings from the user entity
   */
  private loadCurrentAvatar(): void {
    if (this.currentUser.UserImageURL) {
      this.imageUrlInput = this.currentUser.UserImageURL;
      this.previewUrl = this.currentUser.UserImageURL;

      // Determine if it's a Base64 upload or URL
      if (this.userAvatarService.isValidBase64DataUri(this.currentUser.UserImageURL)) {
        this.selectedTab = 'upload';
        this.uploadedImageBase64 = this.currentUser.UserImageURL;
        this.uploadedFileName = 'Current uploaded image';
      } else {
        this.selectedTab = 'url';
      }
    } else if (this.currentUser.UserImageIconClass) {
      this.selectedIconClass = this.currentUser.UserImageIconClass;
      this.previewIconClass = this.currentUser.UserImageIconClass;
      this.selectedTab = 'icon';
    } else {
      // Default to URL tab with empty state
      this.selectedTab = 'url';
    }
  }

  /**
   * Switches between tabs and updates preview
   */
  selectTab(tab: 'upload' | 'url' | 'icon' | 'provider'): void {
    this.selectedTab = tab;
    this.updatePreview();
  }

  /**
   * Handles file selection from native input
   */
  async onFileSelected(event: Event): Promise<void> {
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
      this.uploadedImageBase64 = await this.userAvatarService.fileToBase64(file);
      this.uploadedFileName = file.name;
      this.previewUrl = this.uploadedImageBase64;
      this.previewIconClass = ''; // Clear icon preview
    } catch (error) {
      this.errorMessage = 'Failed to process image. Please try again.';
      console.error('Error converting file to Base64:', error);
    }
  }

  /**
   * Clears uploaded file
   */
  clearUpload(): void {
    this.uploadedFileName = '';
    this.uploadedImageBase64 = '';
    this.previewUrl = '';
    this.errorMessage = '';

    // Reset file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  /**
   * Handles URL input changes
   */
  onUrlChange(): void {
    this.errorMessage = '';

    if (this.imageUrlInput && this.imageUrlInput.trim().length > 0) {
      if (this.userAvatarService.isValidUrl(this.imageUrlInput)) {
        this.previewUrl = this.imageUrlInput;
        this.previewIconClass = ''; // Clear icon preview
      } else {
        this.errorMessage = 'Please enter a valid URL';
        this.previewUrl = '';
      }
    } else {
      this.previewUrl = '';
    }
  }

  /**
   * Handles icon selection
   */
  selectIcon(iconClass: string): void {
    this.selectedIconClass = iconClass;
    this.previewIconClass = iconClass;
    this.previewUrl = ''; // Clear image preview
    this.errorMessage = '';
  }

  /**
   * Checks if an icon is currently selected
   */
  isIconSelected(iconClass: string): boolean {
    return this.selectedIconClass === iconClass;
  }

  /**
   * Syncs avatar from authentication provider
   * NOTE: This is a placeholder - actual implementation should be done
   * in the calling application which has access to auth services
   */
  async syncFromProvider(): Promise<void> {
    this.errorMessage = 'Avatar sync from provider is not yet implemented in settings. Please use the automatic sync on login or manually upload an image.';
    // TODO: Implement auth provider integration
    // The calling application should provide a way to get auth claims
    // and call userAvatarService.syncFromImageUrl() with the appropriate URL and headers
  }

  /**
   * Reverts avatar to default (clears both fields)
   * This will trigger auto-sync from auth provider on next login
   */
  async revertToDefault(): Promise<void> {
    this.isSaving = true;
    this.errorMessage = '';
    this.showSuccessMessage = false;

    try {
      // Clear both avatar fields
      this.currentUser.UserImageURL = null;
      this.currentUser.UserImageIconClass = null;

      // Save to database
      const saved = await this.currentUser.Save();

      if (saved) {
        // Clear local state
        this.imageUrlInput = '';
        this.selectedIconClass = '';
        this.uploadedImageBase64 = '';
        this.uploadedFileName = '';
        this.previewUrl = '';
        this.previewIconClass = '';

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
        this.isSaving = false;
        this.cdr.markForCheck();
      });
    }
  }

  /**
   * Updates the preview based on current tab
   */
  private updatePreview(): void {
    switch (this.selectedTab) {
      case 'upload':
        if (this.uploadedImageBase64) {
          this.previewUrl = this.uploadedImageBase64;
          this.previewIconClass = '';
        }
        break;
      case 'url':
        if (this.imageUrlInput && this.userAvatarService.isValidUrl(this.imageUrlInput)) {
          this.previewUrl = this.imageUrlInput;
          this.previewIconClass = '';
        }
        break;
      case 'icon':
        if (this.selectedIconClass) {
          this.previewIconClass = this.selectedIconClass;
          this.previewUrl = '';
        }
        break;
    }
  }

  /**
   * Saves avatar settings to database
   */
  async save(): Promise<void> {
    this.isSaving = true;
    this.errorMessage = '';
    this.showSuccessMessage = false;

    try {
      // Update user entity based on selected tab
      switch (this.selectedTab) {
        case 'upload':
          if (!this.uploadedImageBase64) {
            this.errorMessage = 'Please select an image to upload';
            this.isSaving = false;
            return;
          }
          this.currentUser.UserImageURL = this.uploadedImageBase64;
          this.currentUser.UserImageIconClass = null;
          break;

        case 'url':
          if (!this.imageUrlInput || !this.userAvatarService.isValidUrl(this.imageUrlInput)) {
            this.errorMessage = 'Please enter a valid image URL';
            this.isSaving = false;
            return;
          }
          this.currentUser.UserImageURL = this.imageUrlInput;
          this.currentUser.UserImageIconClass = null;
          break;

        case 'icon':
          if (!this.selectedIconClass) {
            this.errorMessage = 'Please select an icon';
            this.isSaving = false;
            return;
          }
          this.currentUser.UserImageURL = null;
          this.currentUser.UserImageIconClass = this.selectedIconClass;
          break;
      }

      // Save to database
      const saved = await this.currentUser.Save();

      if (saved) {
        this.showSuccess('Avatar updated successfully!');

        // Notify header component to update avatar display
        MJGlobal.Instance.RaiseEvent({
          event: MJEventType.ComponentEvent,
          eventCode: EventCodes.AvatarUpdated,
          component: this,
          args: {
            imageUrl: this.currentUser.UserImageURL,
            iconClass: this.currentUser.UserImageIconClass
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
        this.isSaving = false;
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
    this.showSuccessMessage = false;
  }

  /**
   * Shows success message temporarily
   */
  private showSuccess(message: string): void {
    this.showSuccessMessage = true;
    this.sharedService.CreateSimpleNotification(message, 'success', 3000);

    // Hide success message after 3 seconds
    setTimeout(() => {
      this.showSuccessMessage = false;
    }, 3000);
  }
}
