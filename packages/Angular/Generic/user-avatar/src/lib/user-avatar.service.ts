import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { IEntityDataProvider, IMetadataProvider, Metadata } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { firstValueFrom } from 'rxjs';

/** The outcome of {@link UserAvatarService.UpdateMyAvatar}. */
export interface UpdateMyAvatarResult {
  Success: boolean;
  /** The server's reason when `Success` is false. */
  ErrorMessage?: string;
}

const UPDATE_MY_AVATAR_MUTATION = `
  mutation UpdateMyAvatar($ImageURL: String, $IconClass: String) {
    UpdateMyAvatar(ImageURL: $ImageURL, IconClass: $IconClass) {
      Success
      ErrorMessage
    }
  }
`;

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
   * Sets the SIGNED-IN user's avatar through the server's self-service `UpdateMyAvatar` mutation.
   *
   * Use this rather than saving the `MJ: Users` row: the mutation needs no Update permission on
   * `MJ: Users`, which locked-down deployments do not grant, and it writes only the two avatar
   * columns. The server validates the values and always acts on the caller's own row.
   *
   * @param imageURL - a base64 image data URI or an http(s) URL; null clears it
   * @param iconClass - a Font Awesome class list; null clears it
   * @param provider - the GraphQL provider to call; defaults to the global provider
   * @returns the server's outcome; never throws
   */
  async UpdateMyAvatar(
    imageURL: string | null,
    iconClass: string | null,
    provider?: IMetadataProvider | IEntityDataProvider
  ): Promise<UpdateMyAvatarResult> {
    try {
      const gql = (provider ?? Metadata.Provider) as GraphQLDataProvider;
      const response = (await gql.ExecuteGQL(UPDATE_MY_AVATAR_MUTATION, {
        ImageURL: imageURL,
        IconClass: iconClass
      })) as { UpdateMyAvatar?: UpdateMyAvatarResult } | null;
      const outcome = response?.UpdateMyAvatar;
      if (outcome?.Success) {
        return { Success: true };
      }
      return { Success: false, ErrorMessage: outcome?.ErrorMessage || 'The server did not save the avatar.' };
    } catch (error) {
      return { Success: false, ErrorMessage: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Syncs the signed-in user's avatar from an image URL (typically from the auth provider profile).
   * Downloads the image, converts it to a Base64 data URI and saves it through {@link UpdateMyAvatar},
   * then reloads `user` so it is clean and current.
   *
   * @param user - the signed-in user's MJUserEntity; any other user is refused
   * @param imageUrl - URL to the image (can be from Microsoft Graph, Google, etc.)
   * @param authHeaders - Optional headers for authenticated requests (e.g., { 'Authorization': 'Bearer token' })
   * @returns Promise<boolean> - true if avatar was synced and saved, false otherwise
   */
  async SyncFromImageUrl(
    user: MJUserEntity,
    imageUrl: string,
    authHeaders?: Record<string, string>
  ): Promise<boolean> {
    try {
      if (!imageUrl || imageUrl.trim().length === 0) {
        console.warn('No image URL provided for avatar sync');
        return false;
      }
      const provider = user.ProviderToUse as GraphQLDataProvider;
      if (!UUIDsEqual(user.ID, provider.CurrentUser?.ID)) {
        console.warn('Avatar sync only updates the signed-in user; refusing to sync another user');
        return false;
      }

      // Fetch the image as a blob and convert it to a Base64 data URI
      const headers: Record<string, string> = authHeaders || {};
      const blob: Blob = await firstValueFrom(
        this.http.get(imageUrl, { headers, responseType: 'blob' })
      );
      const base64 = await this.blobToBase64(blob);

      const result = await this.UpdateMyAvatar(base64, null, provider);
      if (!result.Success) {
        console.warn('Failed to save avatar:', result.ErrorMessage);
        return false;
      }
      await user.Load(user.ID); // pick up the saved values; leaves the entity clean
      console.log('Successfully synced avatar from image URL');
      return true;
    } catch (error) {
      console.warn('Could not sync avatar from image URL:', error);
      return false;
    }
  }

  /** @deprecated Use {@link SyncFromImageUrl}. */
  async syncFromImageUrl(
    user: MJUserEntity,
    imageUrl: string,
    authHeaders?: Record<string, string>
  ): Promise<boolean> {
    return this.SyncFromImageUrl(user, imageUrl, authHeaders);
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
  FileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  /** @deprecated Use {@link FileToBase64}. */
  fileToBase64(file: File): Promise<string> {
    return this.FileToBase64(file);
  }

  /**
   * Validates if a string is a valid URL
   */
  IsValidUrl(url: string): boolean {
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

  /** @deprecated Use {@link IsValidUrl}. */
  isValidUrl(url: string): boolean {
    return this.IsValidUrl(url);
  }

  /**
   * Validates if a string is a valid Base64 data URI
   */
  IsValidBase64DataUri(dataUri: string): boolean {
    if (!dataUri || !dataUri.startsWith('data:')) {
      return false;
    }

    const regex = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/;
    return regex.test(dataUri);
  }

  /** @deprecated Use {@link IsValidBase64DataUri}. */
  isValidBase64DataUri(dataUri: string): boolean {
    return this.IsValidBase64DataUri(dataUri);
  }

  /**
   * Gets the display URL for an avatar based on user settings
   * Priority: UserImageURL > UserImageIconClass > default
   *
   * @param user - The MJUserEntity
   * @param defaultUrl - Optional default URL if no avatar is set
   * @returns The URL to display, or null if using an icon
   */
  GetAvatarDisplayUrl(user: MJUserEntity, defaultUrl: string = 'assets/user.png'): string | null {
    if (user.UserImageURL) {
      return user.UserImageURL;
    }

    if (user.UserImageIconClass) {
      return null; // Indicates icon should be used instead
    }

    return defaultUrl;
  }

  /** @deprecated Use {@link GetAvatarDisplayUrl}. */
  getAvatarDisplayUrl(user: MJUserEntity, defaultUrl: string = 'assets/user.png'): string | null {
    return this.GetAvatarDisplayUrl(user, defaultUrl);
  }

  /**
   * Gets the icon class for an avatar if using icon mode
   */
  GetAvatarIconClass(user: MJUserEntity, defaultIcon: string = 'fa-solid fa-user'): string | null {
    if (user.UserImageIconClass) {
      return user.UserImageIconClass;
    }

    if (!user.UserImageURL) {
      return defaultIcon;
    }

    return null;
  }

  /** @deprecated Use {@link GetAvatarIconClass}. */
  getAvatarIconClass(user: MJUserEntity, defaultIcon: string = 'fa-solid fa-user'): string | null {
    return this.GetAvatarIconClass(user, defaultIcon);
  }
}
