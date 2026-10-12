/**
 * Pure decisions for the Files form's viewer, kept out of the component so they can be tested on the node preset.
 */

/** The viewer's media categories, from the file's MIME type or extension. */
export type FileMediaType = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other';

/**
 * Whether the viewer learns that a file has loaded from a media element's `load` event. Images, PDFs (in an iframe),
 * video and audio do. Text is read by fetch, and any other type has no element at all: the viewer shows a fallback card
 * for it, so the form has to mark it loaded itself once the URL is known, or the loading overlay never clears.
 */
export function MediaLoadsByElement(mediaType: FileMediaType): boolean {
  return mediaType === 'image' || mediaType === 'pdf' || mediaType === 'video' || mediaType === 'audio';
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
