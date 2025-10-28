import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';
import { UserAvatarService } from '@memberjunction/ng-user-avatar';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';

interface IconCategory {
  name: string;
  icons: string[];
}

@Component({
  selector: 'mj-user-profile-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-profile-settings.component.html',
  styleUrls: ['./user-profile-settings.component.css']
})
export class UserProfileSettingsComponent implements OnInit {
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
    private sharedService: SharedService
  ) {}

  async ngOnInit() {
    const md = new Metadata();
    const currentUserInfo = md.CurrentUser;

    // Load the full UserEntity to access avatar fields
    this.currentUser = await md.GetEntityObject<UserEntity>('Users');
    await this.currentUser.Load(currentUserInfo.ID);

    this.loadCurrentAvatar();
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
      this.errorMessage = 'An error occurred while reverting. Please try again.';
      console.error('Error reverting avatar:', error);
    } finally {
      this.isSaving = false;
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
      this.errorMessage = 'An error occurred while saving. Please try again.';
      console.error('Error saving avatar:', error);
    } finally {
      this.isSaving = false;
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
