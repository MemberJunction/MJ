import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MJFileEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJFileFormComponent } from '../../generated/Entities/MJFile/mjfile.form.component';
import { z } from 'zod';

const CreateMediaAccessTokenMutation = gql`
  mutation CreateMediaAccessToken($fileId: String!) {
    CreateMediaAccessToken(fileId: $fileId) {
      Success
      Token
      Url
      MimeType
      ErrorMessage
    }
  }
`;

const CreateMediaAccessTokenMutationSchema = z.object({
  CreateMediaAccessToken: z.object({
    Success: z.boolean(),
    Token: z.string().optional().nullable(),
    Url: z.string().optional().nullable(),
    MimeType: z.string().optional().nullable(),
    ErrorMessage: z.string().optional().nullable(),
  }),
});

const DownloadUrlMutation = gql`
  mutation DownloadUrl($fileId: String!) {
    DownloadUrl(fileId: $fileId) {
      Success
      ErrorMessage
      Url
    }
  }
`;

const DownloadUrlMutationSchema = z.object({
  DownloadUrl: z.object({
    Success: z.boolean(),
    ErrorMessage: z.string().optional().nullable(),
    Url: z.string().optional().nullable(),
  }),
});

@RegisterClass(BaseFormComponent, 'MJ: Files', 100)
@Component({
  standalone: false,
  selector: 'mj-file-form-extended',
  templateUrl: './file-form.component.html',
  styleUrls: ['../../../shared/form-styles.css', './file-form.component.css'],
})
export class MJFileFormComponentExtended extends MJFileFormComponent implements OnInit, OnDestroy, OnChanges {
  public override record!: MJFileEntity;

  public static readonly PREF_SHOW_DETAILS = 'mj.fileViewer.showDetailsSidebar';

  public IsLoadingMedia: boolean = true;
  public IsMediaLoaded: boolean = false;
  public MediaUrl: string | null = null;
  public SafeMediaUrl: SafeResourceUrl | null = null;
  public TextContent: string | null = null;
  public ShowDetailsSidebar: boolean = true;
  public ViewStandardForm: boolean = false;

  private sanitizer = inject(DomSanitizer);
  private notifications = inject(MJNotificationService);
  private mediaTimer?: ReturnType<typeof setTimeout>;

  public override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    this.RestoreUserPreferences();
    if (this.record?.ID) {
      void this.LoadMediaPreview();
    }
  }

  public async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['record'] && this.record?.ID) {
      void this.LoadMediaPreview();
    }
  }

  public override ngOnDestroy(): void {
    if (this.mediaTimer) {
      clearTimeout(this.mediaTimer);
    }
    super.ngOnDestroy();
  }

  private RestoreUserPreferences(): void {
    const saved = UserInfoEngine.Instance.GetSetting(MJFileFormComponentExtended.PREF_SHOW_DETAILS);
    if (saved !== undefined && saved !== null) {
      try {
        this.ShowDetailsSidebar = JSON.parse(saved) === true;
      } catch {
        this.ShowDetailsSidebar = saved === 'true';
      }
    }
  }

  /**
   * Loads the media streaming URL for inline viewing.
   */
  public async LoadMediaPreview(): Promise<void> {
    if (!this.record?.ID) return;

    this.IsLoadingMedia = true;
    this.IsMediaLoaded = false;
    this.MediaUrl = null;
    this.SafeMediaUrl = null;
    this.TextContent = null;
    this.cdr.markForCheck();

    try {
      // 1. Try CreateMediaAccessToken (supports Range headers and browser tab titles)
      const mediaResult = await GraphQLDataProvider.ExecuteGQL(
        CreateMediaAccessTokenMutation,
        { fileId: this.record.ID }
      );
      const parsedMedia = CreateMediaAccessTokenMutationSchema.safeParse(mediaResult);
      if (parsedMedia.success && parsedMedia.data.CreateMediaAccessToken.Success && parsedMedia.data.CreateMediaAccessToken.Url) {
        this.MediaUrl = parsedMedia.data.CreateMediaAccessToken.Url;
        this.SafeMediaUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.MediaUrl);
      } else {
        // 2. Fallback to DownloadUrl
        const downloadResult = await GraphQLDataProvider.ExecuteGQL(
          DownloadUrlMutation,
          { fileId: this.record.ID }
        );
        const parsedDownload = DownloadUrlMutationSchema.safeParse(downloadResult);
        if (parsedDownload.success && parsedDownload.data.DownloadUrl.Success && parsedDownload.data.DownloadUrl.Url) {
          this.MediaUrl = parsedDownload.data.DownloadUrl.Url;
          this.SafeMediaUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.MediaUrl);
        }
      }

      if (this.MediaUrl) {
        const mediaType = this.MediaType;
        if (mediaType === 'text') {
          try {
            const resp = await window.fetch(this.MediaUrl);
            if (resp.ok) {
              this.TextContent = await resp.text();
            }
          } catch {
            // fallback
          }
          this.IsMediaLoaded = true;
        }
      } else {
        this.IsMediaLoaded = true;
      }
    } catch (err) {
      console.error('[MJFileFormComponentExtended] Error loading media preview:', err);
      this.IsMediaLoaded = true;
    } finally {
      this.IsLoadingMedia = false;
      this.cdr.markForCheck();
    }
  }

  public OnMediaElementLoaded(): void {
    if (this.mediaTimer) clearTimeout(this.mediaTimer);
    this.mediaTimer = setTimeout(() => {
      this.IsMediaLoaded = true;
      this.cdr.markForCheck();
    }, 350);
  }

  /**
   * Determines media type category based on MIME type or file extension.
   */
  public get MediaType(): 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other' {
    const mime = (this.record?.ContentType || '').toLowerCase();
    const name = (this.record?.Name || '').toLowerCase();

    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(name)) return 'image';
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv|avi)$/.test(name)) return 'video';
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|aac|m4a|flac)$/.test(name)) return 'audio';
    if (
      mime.startsWith('text/') ||
      mime.includes('json') ||
      mime.includes('xml') ||
      mime.includes('javascript') ||
      /\.(txt|md|csv|json|xml|yaml|yml|js|ts|html|css|sql|sh|log)$/.test(name)
    ) {
      return 'text';
    }
    return 'other';
  }

  public get FileIconClass(): string {
    switch (this.MediaType) {
      case 'image': return 'fa-solid fa-file-image mj-file-color-image';
      case 'pdf': return 'fa-solid fa-file-pdf mj-file-color-pdf';
      case 'video': return 'fa-solid fa-file-video mj-file-color-video';
      case 'audio': return 'fa-solid fa-file-audio mj-file-color-audio';
      case 'text': return 'fa-solid fa-file-lines mj-file-color-text';
      default: return 'fa-solid fa-file mj-file-color-generic';
    }
  }

  public FormatFileSize(bytes: number | null | undefined): string {
    if (bytes == null || isNaN(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, idx);
    return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  public OpenInExternalTab(): void {
    if (this.MediaUrl) {
      window.open(this.MediaUrl, '_blank', 'noopener,noreferrer');
    } else {
      this.notifications.CreateSimpleNotification('File URL not ready', 'warning');
    }
  }

  public ToggleDetailsSidebar(): void {
    this.ShowDetailsSidebar = !this.ShowDetailsSidebar;
    UserInfoEngine.Instance.SetSettingDebounced(
      MJFileFormComponentExtended.PREF_SHOW_DETAILS,
      JSON.stringify(this.ShowDetailsSidebar)
    );
  }

  public ToggleViewMode(): void {
    this.ViewStandardForm = !this.ViewStandardForm;
  }
}
