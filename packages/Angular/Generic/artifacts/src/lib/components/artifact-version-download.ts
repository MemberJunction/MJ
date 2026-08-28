/**
 * Preparing an artifact version for download.
 *
 * Kept separate from the component so the decoding rules are unit-testable without Angular.
 */

/** What the browser should be handed: the bytes (or text), its MIME type, and a filename. */
export interface VersionDownload {
  data: BlobPart;
  mimeType: string;
  fileName: string;
}

/**
 * Turn a version's stored `Content` into a real download.
 *
 * An artifact version holding a FILE stores it as a `data:<mime>;base64,...` URI (see
 * `AgentRunner.createInlineFileArtifact`, used whenever no file storage account is configured).
 * Writing that string out verbatim as `text/plain` named `<name>.txt` — which is what this did —
 * produced a text file containing base64, so opening the "downloaded document" gave an invalid
 * file format. The bytes were always correct; only the download was wrong.
 *
 * A data URI is therefore decoded to bytes and given its real MIME type and filename. Text
 * content (Markdown, JSON, code) keeps the previous behaviour.
 *
 * @param content        the version's `Content`
 * @param fileName       the version's `FileName`, when it has one
 * @param artifactName   fallback name
 * @param versionNumber  used only in the fallback name
 * @param mimeType       the version's `MimeType`, used when the content is not a data URI
 */
export function buildVersionDownload(
  content: string,
  fileName: string | null | undefined,
  artifactName: string | null | undefined,
  versionNumber: number | null | undefined,
  mimeType?: string | null
): VersionDownload {
  const dataUri = /^data:([^;,]+);base64,(.*)$/is.exec(content.trim());
  if (dataUri) {
    const [, uriMimeType, base64] = dataUri;
    // `atob` throws on malformed base64 that still matched the pattern. The caller only logs, so
    // an unguarded throw turns "download" into a click that does nothing at all; falling through
    // to the text path at least hands the user the bytes that are stored.
    let binary: string | null = null;
    try {
      binary = atob(base64);
    } catch {
      binary = null;
    }
    if (binary !== null) {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return {
        data: bytes,
        mimeType: uriMimeType,
        // The stored FileName already carries the correct extension; only fall back when absent.
        fileName: fileName?.trim() || `${artifactName ?? 'artifact'}_v${versionNumber ?? 1}`,
      };
    }
    // Fall through to the text path below: a click that hands over the stored bytes beats one
    // that silently does nothing.
  }

  // Text content — unchanged from the original behaviour, but honour a real filename when present.
  return {
    data: content,
    mimeType: mimeType?.trim() || 'text/plain',
    fileName: fileName?.trim() || `${artifactName ?? 'artifact'}_v${versionNumber ?? 1}.txt`,
  };
}
