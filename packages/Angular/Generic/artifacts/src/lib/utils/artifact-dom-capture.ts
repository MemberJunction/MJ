import {
  ArtifactMetadataEngine,
  IsValidThumbnailDataUrl,
  ResolveArtifactTypeThumbnailPolicy,
  type ArtifactTypeThumbnailPolicy,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

// Genuine bundle-size deferral: html-to-image is only needed when thumbnail capture executes,
// keeping it out of eager realtime-widget-session and artifact-viewer bundles.
type HtmlToImageModule = typeof import('html-to-image');
let htmlToImagePromise: Promise<HtmlToImageModule> | null = null;
function loadHtmlToImage(): Promise<HtmlToImageModule> {
  if (!htmlToImagePromise) {
    htmlToImagePromise = import('html-to-image');
  }
  return htmlToImagePromise;
}

/** Options controlling DOM screenshot capture for Library artifact card thumbnails. */
export interface CaptureRenderedThumbnailOptions {
  /** When `true` (default), masks live database blocks (`.mj-docs-live-block`, `[data-mj-live-block]`, `[data-mj-live-query]`) before rasterization. */
  MaskLiveDataBlocks?: boolean;
  /** Target output image width in CSS pixels (default 560). */
  TargetWidth?: number;
  /** Maximum output image height in CSS pixels (default 315). */
  MaxTargetHeight?: number;
  /** DOM node safety ceiling to avoid UI hangs on giant documents (default 20000). */
  MaxNodes?: number;
  /** Capture timeout in milliseconds (default 3500). */
  TimeoutMs?: number;
  /** Canvas background fallback if computed element background is transparent. */
  BackgroundColor?: string;
}

const DEFAULT_TARGET_WIDTH = 560;
const DEFAULT_MAX_TARGET_HEIGHT = 315;
const DEFAULT_MAX_NODES = 20000;
const DEFAULT_TIMEOUT_MS = 3500;

interface LiveMaskRestoration {
  BlockEl: HTMLElement;
  PrevPosition: string;
  HiddenChildren: Array<{ El: HTMLElement; PrevVisibility: string }>;
  OverlayEl: HTMLElement;
}

function getEffectiveBackgroundColor(el: HTMLElement, fallback: string): string {
  const view = el.ownerDocument?.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') {
    return fallback;
  }
  let cur: HTMLElement | null = el;
  while (cur) {
    const bg = view.getComputedStyle(cur).backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      return bg;
    }
    cur = cur.parentElement;
  }
  return fallback;
}

function maskLiveDataWidgets(root: HTMLElement): LiveMaskRestoration[] {
  const doc = root.ownerDocument;
  const targets = root.querySelectorAll<HTMLElement>(
    '.mj-docs-live-block, [data-mj-live-block], [data-mj-live-query]',
  );
  const restorations: LiveMaskRestoration[] = [];

  targets.forEach((blockEl) => {
    const bodyEl =
      blockEl.querySelector<HTMLElement>('.mj-docs-live-block__body') ?? blockEl;
    const prevPosition = bodyEl.style.position;
    if (!prevPosition || prevPosition === 'static') {
      bodyEl.style.position = 'relative';
    }

    const hiddenChildren: Array<{ El: HTMLElement; PrevVisibility: string }> = [];
    for (let i = 0; i < bodyEl.children.length; i++) {
      const child = bodyEl.children[i];
      if (child instanceof HTMLElement) {
        hiddenChildren.push({ El: child, PrevVisibility: child.style.visibility });
        child.style.visibility = 'hidden';
      }
    }

    const overlay = doc.createElement('div');
    overlay.setAttribute('data-mj-thumb-mask', 'true');
    overlay.style.position = 'absolute';
    overlay.style.inset = '4px';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.gap = '8px';
    overlay.style.borderRadius = '8px';
    overlay.style.background = '#132033';
    overlay.style.border = '1px solid #2a3f5f';
    overlay.style.color = '#93c5fd';
    overlay.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    overlay.style.fontSize = '12px';
    overlay.style.fontWeight = '600';
    overlay.style.letterSpacing = '0.02em';
    overlay.style.zIndex = '9999';
    overlay.style.minHeight = '36px';
    overlay.textContent = 'Live MJ Data · Protected';
    bodyEl.appendChild(overlay);

    restorations.push({
      BlockEl: bodyEl,
      PrevPosition: prevPosition,
      HiddenChildren: hiddenChildren,
      OverlayEl: overlay,
    });
  });

  return restorations;
}

function restoreMaskedWidgets(restorations: LiveMaskRestoration[]): void {
  for (let i = restorations.length - 1; i >= 0; i--) {
    const r = restorations[i];
    try {
      r.OverlayEl.remove();
      for (const item of r.HiddenChildren) {
        item.El.style.visibility = item.PrevVisibility;
      }
      r.BlockEl.style.position = r.PrevPosition;
    } catch {
      // Ignore cleanup errors if element detached during navigation
    }
  }
}

/**
 * Captures the top viewport region of `rootElement` as a compact WebP/JPEG `data:` URI
 * suitable for storing in `MJArtifactVersionEntity.Configuration.thumbnailDataUrl`.
 * Returns `null` cleanly if running under SSR, if the element has zero size / exceeds
 * node limits, or if rasterization fails or times out.
 */
export async function CaptureRenderedElementThumbnail(
  rootElement: HTMLElement | null | undefined,
  options: CaptureRenderedThumbnailOptions = {},
): Promise<string | null> {
  if (!rootElement || typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }
  const elW = rootElement.clientWidth;
  const elH = rootElement.clientHeight;
  if (elW <= 0 || elH <= 0) {
    return null;
  }

  const maxNodes = options.MaxNodes ?? DEFAULT_MAX_NODES;
  if (rootElement.getElementsByTagName('*').length > maxNodes) {
    return null;
  }

  const targetWidth = options.TargetWidth ?? DEFAULT_TARGET_WIDTH;
  const maxTargetHeight = options.MaxTargetHeight ?? DEFAULT_MAX_TARGET_HEIGHT;
  const timeoutMs = options.TimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maskLive = options.MaskLiveDataBlocks !== false;

  const cropWidth = Math.max(1, elW);
  const desiredAspectRatio = maxTargetHeight / targetWidth;
  const maxCropHeight = Math.max(180, Math.round(cropWidth * desiredAspectRatio));
  const cropHeight = Math.min(Math.max(1, elH), maxCropHeight);

  const scale = targetWidth / cropWidth;
  const canvasWidth = Math.max(1, Math.round(cropWidth * scale));
  const canvasHeight = Math.min(maxTargetHeight, Math.max(1, Math.round(cropHeight * scale)));

  const backgroundColor =
    options.BackgroundColor ?? getEffectiveBackgroundColor(rootElement, '#0e1623');

  const restorations = maskLive ? maskLiveDataWidgets(rootElement) : [];
  try {
    const { toCanvas } = await loadHtmlToImage();
    const capturePromise = toCanvas(rootElement, {
      width: cropWidth,
      height: cropHeight,
      canvasWidth,
      canvasHeight,
      pixelRatio: 1,
      backgroundColor,
      skipFonts: true,
      cacheBust: false,
      style: {
        overflow: 'hidden',
        maxHeight: `${cropHeight}px`,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Thumbnail capture timed out')), timeoutMs);
    });

    const canvas = await Promise.race([capturePromise, timeoutPromise]);
    const webp = canvas.toDataURL('image/webp', 0.82);
    if (IsValidThumbnailDataUrl(webp)) {
      return webp;
    }
    const jpeg = canvas.toDataURL('image/jpeg', 0.82);
    return IsValidThumbnailDataUrl(jpeg) ? jpeg : null;
  } catch {
    return null;
  } finally {
    restoreMaskedWidgets(restorations);
  }
}

/**
 * Encodes an exported SVG string (such as `BuildWhiteboardExportSvg(state)`) into a
 * base64 `data:image/svg+xml;base64,...` URI validated against size caps.
 */
export function SerializeSvgToDataUrl(svg: string | null | undefined): string | null {
  if (!svg || typeof svg !== 'string') {
    return null;
  }
  const trimmed = svg.trim();
  if (!trimmed.includes('<svg')) {
    return null;
  }
  try {
    const bytes = new TextEncoder().encode(trimmed);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...slice);
    }
    const dataUrl = `data:image/svg+xml;base64,${btoa(binary)}`;
    return IsValidThumbnailDataUrl(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the effective {@link ArtifactTypeThumbnailPolicy} for a viewer driver class and captures
 * a rendered DOM thumbnail only when the policy is `{ Enabled: true, Mode: 'Rendered' }`.
 */
export async function CaptureThumbnailForDriverIfAllowed(
  driverClass: string,
  rootElement: HTMLElement | null | undefined,
  artifactTypeId?: string | null,
): Promise<{ Policy: ArtifactTypeThumbnailPolicy; CapturedThumbnailDataUrl: string | null }> {
  const allTypes = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
  const typeEntity =
    (artifactTypeId
      ? allTypes.find((t) => UUIDsEqual(t.ID, artifactTypeId))
      : undefined) ??
    allTypes.find((t) => t.DriverClass === driverClass) ??
    null;
  const policy = ResolveArtifactTypeThumbnailPolicy(typeEntity, allTypes, driverClass);
  if (!policy.Enabled || policy.Mode !== 'Rendered' || !rootElement) {
    return { Policy: policy, CapturedThumbnailDataUrl: null };
  }
  const captured = await CaptureRenderedElementThumbnail(rootElement, {
    MaskLiveDataBlocks: policy.MaskLiveDataBlocks,
  });
  return { Policy: policy, CapturedThumbnailDataUrl: captured };
}
