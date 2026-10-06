/**
 * @fileoverview Type definitions for the Record Attachments / Linked Files widget.
 * @module @memberjunction/ng-file-storage
 */

import { BaseEntity } from '@memberjunction/core';
import { MJFileEntity, MJFileEntityRecordLinkEntity } from '@memberjunction/core-entities';

/**
 * Display item representing an attachment linked to a specific entity record.
 */
export interface RecordAttachmentItem {
  /** The MJ: File Entity Record Links primary key */
  LinkID: string;
  /** The MJ: Files primary key */
  FileID: string;
  /** File display name */
  Name: string;
  /** File description */
  Description?: string | null;
  /** MIME content type (e.g. 'application/pdf', 'image/png') */
  ContentType?: string | null;
  /** File size in bytes */
  FileSize?: number | null;
  /** Upload / processing status (e.g. 'Uploaded', 'Pending') */
  Status?: string | null;
  /** Storage Provider Name (e.g. 'Azure Blob Storage', 'AWS S3') */
  ProviderName?: string | null;
  /** Storage Provider ID */
  ProviderID?: string | null;
  /** Storage Provider Icon CSS class (e.g. 'fa-solid fa-box', 'fa-brands fa-aws') */
  ProviderIconClass?: string | null;
  /** Storage Provider Brand Color (e.g. '#0061D5') */
  ProviderBrandColor?: string | null;
  /** Storage Account ID */
  StorageAccountID?: string | null;
  /** File Category ID */
  CategoryID?: string | null;
  /** File Category Name */
  CategoryName?: string | null;
  /** Created timestamp */
  CreatedAt?: Date | null;
  /** Updated timestamp */
  UpdatedAt?: Date | null;
  /** The underlying File entity if loaded */
  FileEntity?: MJFileEntity;
  /** The underlying Link entity if loaded */
  LinkEntity?: MJFileEntityRecordLinkEntity;
}

/**
 * Display mode for attachments list.
 */
export type AttachmentViewMode = 'grid' | 'list';

/**
 * Categorized media classification for previews.
 */
export type AttachmentMediaType = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'document' | 'other';

/**
 * Configuration options for the Record Attachments widget.
 */
export interface RecordAttachmentsConfig {
  /** Whether uploads are allowed. Default: true (subject to entity/user permissions) */
  AllowUpload?: boolean;
  /** Whether deleting (hard delete from storage) is allowed. Default: true */
  AllowDelete?: boolean;
  /** Whether unlinking from record is allowed. Default: true */
  AllowUnlink?: boolean;
  /** Whether downloads are allowed. Default: true */
  AllowDownload?: boolean;
  /** Whether in-app preview is allowed. Default: true */
  AllowPreview?: boolean;
  /** Whether replacing attachments with new file is allowed. Default: true */
  AllowReplace?: boolean;
  /** Whether editing file metadata (name, description, category) is allowed. Default: true */
  AllowEditMetadata?: boolean;
  /** Maximum file size in bytes */
  MaxFileSizeBytes?: number;
  /** Allowed MIME types or file extensions (e.g. ['image/*', 'application/pdf']) */
  AllowedContentTypes?: string[];
  /** Default Storage Account ID for uploads */
  DefaultStorageAccountID?: string;
  /** Default File Category ID for uploads */
  DefaultCategoryID?: string;
}

/**
 * Helper to determine media type from MIME type or file name.
 */
export function GetAttachmentMediaType(contentType?: string | null, fileName?: string | null): AttachmentMediaType {
  const mime = (contentType ?? '').toLowerCase().trim();
  const name = (fileName ?? '').toLowerCase().trim();

  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    return 'pdf';
  }
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name)) {
    return 'image';
  }
  if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v|mkv)$/i.test(name)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) {
    return 'audio';
  }
  if (
    mime.includes('word') ||
    mime.includes('officedocument') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('excel') ||
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime.includes('msword') ||
    /\.(docx?|xlsx?|pptx?)$/i.test(name)
  ) {
    return 'document';
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('xml') ||
    /\.(txt|md|json|ts|js|html|css|scss|xml|csv|log|yaml|yml|py|sql)$/i.test(name)
  ) {
    return 'text';
  }
  return 'other';
}

/**
 * Format bytes to human-readable string (e.g. "4.2 MB").
 */
export function FormatAttachmentFileSize(bytes?: number | null): string {
  if (bytes == null || bytes < 0 || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
