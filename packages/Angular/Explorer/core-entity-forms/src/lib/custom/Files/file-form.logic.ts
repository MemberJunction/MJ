/**
 * Pure decisions for the Files form's viewer, kept out of the component so they can be tested on the node preset.
 */

/** The viewer's media categories, from the file's MIME type or extension. */
export type FileMediaType = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'docx' | 'xlsx' | 'other';

/**
 * Whether the viewer learns that a file has loaded from the element that shows it. Images, PDFs (in an iframe), video
 * and audio fire `load`; the Word and Excel previews report `loaded` or `failed` themselves. Text is read by fetch, and
 * any other type has no element at all: the viewer shows a fallback card for it, so the form has to mark it loaded
 * itself once the URL is known, or the loading overlay never clears.
 */
export function MediaLoadsByElement(mediaType: FileMediaType): boolean {
  return mediaType === 'image' || mediaType === 'pdf' || mediaType === 'video' || mediaType === 'audio' || mediaType === 'docx' || mediaType === 'xlsx';
}

/**
 * The viewer's category for a file, from its MIME type or its name. The name matters: the server stores anything it
 * cannot stream inline as `application/octet-stream`, so a Word or Excel file is only recognisable by its extension.
 * Legacy `.doc` is not `docx`: mammoth reads OOXML only, so it keeps the fallback card.
 */
export function ClassifyFileMediaType(contentType: string | null | undefined, fileName: string | null | undefined): FileMediaType {
  const mime = (contentType || '').toLowerCase().split(';')[0].trim();
  const name = (fileName || '').toLowerCase();

  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv|avi)$/.test(name)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|aac|m4a|flac)$/.test(name)) return 'audio';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    /\.(xlsx|xlsm|xls)$/.test(name)
  ) {
    return 'xlsx';
  }
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

/**
 * The size badge's text, or null when the size is not known. `MJ: Files` records no length today, so the badge is left
 * out rather than reading "0 B" for every file.
 */
export function DescribeFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}
