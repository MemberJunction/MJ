import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MJUserEntity } from '@memberjunction/core-entities';
import { firstValueFrom } from 'rxjs';

/**
 * Service for managing user avatar operations across the application.
 *
 * NOTE: This service does NOT depend on any Explorer-specific packages to remain
 * usable across different Angular applications. All auth provider logic should
 * be handled by the calling code.
 */
@Injectable({
  providedIn: 'root'
})
export class UserAvatarService {
  constructor(private http: HttpClient) {}

  /**
   * Syncs user avatar from an image URL (typically from auth provider profile).
   * Downloads the image, converts to Base64, and saves to the user entity.
   *
   * @param user - The MJUserEntity to update with avatar data
   * @param imageUrl - URL to the image (can be from Microsoft Graph, Google, etc.)
   * @param authHeaders - Optional headers for authenticated requests (e.g., { 'Authorization': 'Bearer token' })
   * @returns Promise<boolean> - true if avatar was synced and saved, false otherwise
   */
  async syncFromImageUrl(
    user: MJUserEntity,
    imageUrl: string,
    authHeaders?: Record<string, string>
  ): Promise<boolean> {
    try {
      if (!imageUrl || imageUrl.trim().length === 0) {
        console.warn('No image URL provided for avatar sync');
        return false;
      }

      // Fetch the image as a blob
      const headers: Record<string, string> = authHeaders || {};
      const blob: Blob = await firstValueFrom(
        this.http.get(imageUrl, { headers, responseType: 'blob' })
      );

      // Convert blob to Base64 data URI
      const base64 = await this.blobToBase64(blob);

      // Update user entity
      user.UserImageURL = base64;
      user.UserImageIconClass = null; // Clear icon if we have an image

      // Save to database
      const saved = await user.Save();

      if (saved) {
        console.log('Successfully synced avatar from image URL');
        return true;
      } else {
        console.warn('Failed to save avatar to database');
        return false;
      }
    } catch (error) {
      console.warn('Could not sync avatar from image URL:', error);
      return false;
    }
  }

  /**
   * Converts a Blob to a Base64 data URI string
   * Returns format: "data:image/png;base64,iVBORw0KG..."
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Converts a File to a Base64 data URI string
   * Used for file uploads in settings UI
   */
  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Validates if a string is a valid URL
   */
  isValidUrl(url: string): boolean {
    if (!url || url.trim().length === 0) {
      return false;
    }

    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates if a string is a valid Base64 data URI
   */
  isValidBase64DataUri(dataUri: string): boolean {
    if (!dataUri || !dataUri.startsWith('data:')) {
      return false;
    }

    const regex = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/;
    return regex.test(dataUri);
  }

  /**
   * Gets the display URL for an avatar based on user settings
   * Priority: UserImageURL > UserImageIconClass > default
   *
   * @param user - The MJUserEntity
   * @param defaultUrl - Optional default URL if no avatar is set
   * @returns The URL to display, or null if using an icon
   */
  getAvatarDisplayUrl(user: MJUserEntity, defaultUrl: string = 'assets/user.png'): string | null {
    if (user.UserImageURL) {
      return user.UserImageURL;
    }

    if (user.UserImageIconClass) {
      return null; // Indicates icon should be used instead
    }

    return defaultUrl;
  }

  /**
   * Gets the icon class for an avatar if using icon mode
   */
  getAvatarIconClass(user: MJUserEntity, defaultIcon: string = 'fa-solid fa-user'): string | null {
    if (user.UserImageIconClass) {
      return user.UserImageIconClass;
    }

    if (!user.UserImageURL) {
      return defaultIcon;
    }

    return null;
  }
}
