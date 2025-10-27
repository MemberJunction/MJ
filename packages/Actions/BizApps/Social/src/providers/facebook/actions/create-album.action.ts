import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, FacebookAlbum } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { MediaFile, SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/global';
import axios from 'axios';
import FormData from 'form-data';
import { BaseAction } from '@memberjunction/actions';

/**
 * Creates a photo album on a Facebook page and optionally uploads photos to it.
 * Albums help organize related photos together.
 */
@RegisterClass(BaseAction, 'FacebookCreateAlbumAction')
export class FacebookCreateAlbumAction extends FacebookBaseAction {
  /**
   * Get action description
   */
  public get Description(): string {
    return 'Creates a photo album on a Facebook page and optionally uploads photos to it';
  }

  /**
   * Define the parameters for this action
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'PageID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'AlbumName',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Description',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Location',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Privacy',
        Type: 'Input',
        Value: 'EVERYONE',
      },
      {
        Name: 'Photos',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'PhotoCaptions',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CoverPhotoIndex',
        Type: 'Input',
        Value: 0,
      },
      {
        Name: 'MakeAlbumPublic',
        Type: 'Input',
        Value: true,
      },
    ];
  }

  /**
   * Execute the action
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;

    try {
      // Validate required parameters
      const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
      const pageId = this.getParamValue(Params, 'PageID');
      const albumName = this.getParamValue(Params, 'AlbumName');

      if (!companyIntegrationId) {
        return {
          Success: false,
          Message: 'CompanyIntegrationID is required',
          ResultCode: 'INVALID_TOKEN',
        };
      }

      if (!pageId) {
        return {
          Success: false,
          Message: 'PageID is required',
          ResultCode: 'MISSING_REQUIRED_PARAM',
        };
      }

      if (!albumName) {
        return {
          Success: false,
          Message: 'AlbumName is required',
          ResultCode: 'MISSING_REQUIRED_PARAM',
        };
      }

      // Initialize OAuth
      if (!(await this.initializeOAuth(companyIntegrationId))) {
        return {
          Success: false,
          Message: 'Failed to initialize Facebook OAuth connection',
          ResultCode: 'INVALID_TOKEN',
        };
      }

      // Get parameters
      const description = this.getParamValue(Params, 'Description') as string;
      const location = this.getParamValue(Params, 'Location') as string;
      const privacy = this.getParamValue(Params, 'Privacy') as string;
      const photos = this.getParamValue(Params, 'Photos') as MediaFile[];
      const photoCaptions = this.getParamValue(Params, 'PhotoCaptions') as string[];
      const coverPhotoIndex = (this.getParamValue(Params, 'CoverPhotoIndex') as number) || 0;
      const makeAlbumPublic = this.getParamValue(Params, 'MakeAlbumPublic') !== false;

      // Validate photos are images
      if (photos && photos.length > 0) {
        for (const photo of photos) {
          if (!photo.mimeType.startsWith('image/')) {
            return {
              Success: false,
              Message: `Only image files are allowed in albums. File ${photo.filename} is ${photo.mimeType}`,
              ResultCode: 'INVALID_MEDIA',
            };
          }
        }
      }

      LogStatus(`Creating album "${albumName}" on Facebook page ${pageId}...`);

      // Get page access token
      const pageToken = await this.getPageAccessToken(pageId);

      // Create the album
      const albumData: any = {
        name: albumName,
        privacy: {
          value: privacy,
        },
      };

      if (description) {
        albumData.message = description;
      }

      if (location) {
        albumData.location = location;
      }

      const albumResponse = await axios.post(`${this.apiBaseUrl}/${pageId}/albums`, albumData, {
        params: {
          access_token: pageToken,
        },
      });

      const albumId = albumResponse.data.id;
      LogStatus(`Album created with ID: ${albumId}`);

      // Upload photos if provided
      const uploadedPhotos: any[] = [];
      let coverPhotoId: string | null = null;

      if (photos && photos.length > 0) {
        LogStatus(`Uploading ${photos.length} photos to the album...`);

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const caption = photoCaptions?.[i] || '';

          try {
            const photoId = await this.uploadPhotoToAlbum(
              albumId,
              photo,
              caption,
              pageToken,
              !makeAlbumPublic // Keep unpublished if album is not public yet
            );

            uploadedPhotos.push({
              id: photoId,
              filename: photo.filename,
              caption,
            });

            if (i === coverPhotoIndex) {
              coverPhotoId = photoId;
            }

            LogStatus(`Uploaded photo ${i + 1}/${photos.length}: ${photo.filename}`);
          } catch (error) {
            LogError(`Failed to upload photo ${photo.filename}: ${error}`);
            // Continue with other photos
          }
        }
      }

      // Set cover photo if specified and photos were uploaded
      if (coverPhotoId) {
        try {
          await this.setAlbumCoverPhoto(albumId, coverPhotoId, pageToken);
          LogStatus(`Set cover photo for album`);
        } catch (error) {
          LogError(`Failed to set cover photo: ${error}`);
          // Non-critical error, continue
        }
      }

      // Get the final album details
      const album = await this.getAlbumDetails(albumId, pageToken);

      LogStatus(`Album "${albumName}" created successfully with ${uploadedPhotos.length} photos`);

      return {
        Success: true,
        Message: `Album created successfully with ${uploadedPhotos.length} photos`,
        ResultCode: 'SUCCESS',
        Params,
      };
    } catch (error) {
      LogError(`Failed to create Facebook album: ${error instanceof Error ? error.message : 'Unknown error'}`);

      if (this.isAuthError(error)) {
        return this.handleOAuthError(error);
      }

      return {
        Success: false,
        Message: error instanceof Error ? error.message : 'Unknown error occurred',
        ResultCode: 'ERROR',
      };
    }
  }

  /**
   * Upload a photo to an album
   */
  private async uploadPhotoToAlbum(
    albumId: string,
    photo: MediaFile,
    caption: string,
    pageToken: string,
    unpublished: boolean = false
  ): Promise<string> {
    const fileData = typeof photo.data === 'string' ? Buffer.from(photo.data, 'base64') : photo.data;

    const formData = new FormData();
    formData.append('source', fileData, {
      filename: photo.filename,
      contentType: photo.mimeType,
    });

    if (caption) {
      formData.append('message', caption);
    }

    if (unpublished) {
      formData.append('published', 'false');
    }

    const response = await axios.post(`${this.apiBaseUrl}/${albumId}/photos`, formData, {
      headers: formData.getHeaders(),
      params: {
        access_token: pageToken,
      },
    });

    return response.data.id;
  }

  /**
   * Set the cover photo for an album
   */
  private async setAlbumCoverPhoto(albumId: string, photoId: string, pageToken: string): Promise<void> {
    await axios.post(
      `${this.apiBaseUrl}/${albumId}`,
      {
        cover_photo: photoId,
      },
      {
        params: {
          access_token: pageToken,
        },
      }
    );
  }

  /**
   * Get album details
   */
  private async getAlbumDetails(albumId: string, pageToken: string): Promise<FacebookAlbum | null> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/${albumId}`, {
        params: {
          access_token: pageToken,
          fields: 'id,name,description,link,cover_photo,count,created_time,photos.limit(1){id,images}',
        },
      });

      return response.data;
    } catch (error) {
      LogError(`Failed to get album details: ${error}`);
      return null;
    }
  }
}
