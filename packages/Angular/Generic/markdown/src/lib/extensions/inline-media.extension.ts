/**
 * @fileoverview Post-render DOM helper that upgrades `/media/:fileId` video markdown images
 * (`![title](/media/:id?token=...&kind=video&vtt=:vttId&vttToken=...#t=42)`) into HTML5 `<video>`
 * players with WebVTT caption tracks and a lazy, time-synced click-to-seek transcript drawer.
 *
 * Pure web-only DOM helper (zero router, server, or entity dependencies).
 */

/** A timed caption cue parsed from a WebVTT or SubRip (SRT) sidecar track. */
export interface InlineMediaCue {
  /** Stable cue identifier (`cue-1`, etc., or the cue's authored VTT/SRT identifier). */
  Id: string;
  /** Cue start timestamp in milliseconds. */
  StartMs: number;
  /** Optional cue end timestamp in milliseconds. */
  EndMs?: number;
  /** Optional speaker name extracted from `<v Speaker>` or `Speaker: ...` prefixes. */
  SpeakerLabel?: string;
  /** Plain-text spoken cue content with formatting tags stripped. */
  Text: string;
}

const VIDEO_FILE_EXTENSIONS = ['.mp4', '.webm', '.m4v', '.mov'] as const;
const SAFE_FILE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Parse a timestamp token (`75`, `"01:15"`, `"00:01:15.500"`, `"00:01:15,500"`) into seconds.
 * Returns `null` when the input is empty, negative, or malformed.
 */
export function ParseInlineMediaTimestampSeconds(raw: string): number | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  if (/^\d{1,7}(?:\.\d{1,3})?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const match = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(trimmed);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes >= 60 || seconds >= 60) return null;
  const millis = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/** Format milliseconds as `MM:SS` (or `H:MM:SS` when >= 1 hour). */
export function FormatInlineMediaTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function parseTimingLine(line: string): { startMs: number; endMs: number } | null {
  const arrowIndex = line.indexOf('-->');
  if (arrowIndex < 0) return null;
  const left = line.slice(0, arrowIndex).trim();
  const afterArrow = line.slice(arrowIndex + 3).trim();
  let rightEnd = afterArrow.length;
  for (let i = 0; i < afterArrow.length; i++) {
    const ch = afterArrow.charCodeAt(i);
    if (ch === 32 || ch === 9) {
      rightEnd = i;
      break;
    }
  }
  const rightToken = afterArrow.slice(0, rightEnd);
  const startSec = ParseInlineMediaTimestampSeconds(left);
  const endSec = ParseInlineMediaTimestampSeconds(rightToken);
  if (startSec == null || endSec == null) return null;
  return { startMs: Math.round(startSec * 1000), endMs: Math.round(endSec * 1000) };
}

/** Linear tag stripper with zero backtracking regexes (`js/polynomial-redos` safe). */
function stripCueTagsAndCollapseWhitespace(input: string): string {
  let out = '';
  let i = 0;
  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt < 0) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, lt);
    const gt = input.indexOf('>', lt + 1);
    if (gt < 0) {
      out += input.slice(lt);
      break;
    }
    out += ' ';
    i = gt + 1;
  }

  const decoded = out
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

  let normalized = '';
  let prevSpace = true;
  for (let idx = 0; idx < decoded.length; idx++) {
    const code = decoded.charCodeAt(idx);
    const isSpace = code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
    if (isSpace) {
      if (!prevSpace) {
        normalized += ' ';
        prevSpace = true;
      }
    } else {
      normalized += decoded[idx];
      prevSpace = false;
    }
  }
  return normalized.trim();
}

function extractVoiceTagSpeaker(body: string): { speaker?: string; remainder: string } {
  if (body.length < 4 || body[0] !== '<') return { remainder: body };
  const second = body[1];
  if (second !== 'v' && second !== 'V') return { remainder: body };
  const third = body[2];
  if (third !== ' ' && third !== '\t' && third !== '.') return { remainder: body };
  const gt = body.indexOf('>');
  if (gt <= 2) return { remainder: body };
  const openTag = body.slice(1, gt);
  let spaceIdx = -1;
  for (let i = 1; i < openTag.length; i++) {
    if (openTag[i] === ' ' || openTag[i] === '\t') {
      spaceIdx = i;
      break;
    }
  }
  if (spaceIdx < 0) return { remainder: body };
  const speaker = openTag.slice(spaceIdx + 1).trim();
  const remainder = body.slice(gt + 1);
  return speaker ? { speaker, remainder } : { remainder };
}

function isSpeakerLabelCandidate(candidate: string): boolean {
  if (candidate.length === 0 || candidate.length > 31) return false;
  const first = candidate.charCodeAt(0);
  if (first < 65 || first > 90) return false;
  for (let i = 1; i < candidate.length; i++) {
    const ch = candidate.charCodeAt(i);
    const isAlphaNum = (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || (ch >= 48 && ch <= 57);
    const isAllowedPunct = ch === 32 || ch === 46 || ch === 39 || ch === 45;
    if (!isAlphaNum && !isAllowedPunct) return false;
  }
  return true;
}

function cleanCueLines(lines: readonly string[]): { speaker?: string; text: string } {
  const joined = lines.join(' ').trim();
  const voice = extractVoiceTagSpeaker(joined);
  let speaker = voice.speaker;
  let text = stripCueTagsAndCollapseWhitespace(voice.remainder);

  if (!speaker) {
    const colon = text.indexOf(':');
    if (colon > 0 && colon <= 31) {
      const candidate = text.slice(0, colon).trim();
      const rest = text.slice(colon + 1).trim();
      if (isSpeakerLabelCandidate(candidate) && rest.length > 0) {
        speaker = candidate;
        text = rest;
      }
    }
  }
  return { ...(speaker ? { speaker } : {}), text };
}

/** Parse WebVTT or SubRip (SRT) caption text into timed cues on the client. */
export function ParseInlineMediaCues(raw: string): InlineMediaCue[] {
  const normalized = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n');
  const lines = normalized.split('\n');
  const cues: InlineMediaCue[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line === 'WEBVTT' || line.startsWith('WEBVTT ') || line.startsWith('WEBVTT\t')) {
      i++;
      continue;
    }
    const upper = line.toUpperCase();
    if (
      upper === 'NOTE' ||
      upper.startsWith('NOTE ') ||
      upper.startsWith('NOTE\t') ||
      upper === 'STYLE' ||
      upper.startsWith('STYLE ') ||
      upper.startsWith('STYLE\t') ||
      upper === 'REGION' ||
      upper.startsWith('REGION ') ||
      upper.startsWith('REGION\t')
    ) {
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    let cueId = '';
    let timing = parseTimingLine(line);
    if (!timing && i + 1 < lines.length) {
      const nextTiming = parseTimingLine(lines[i + 1].trim());
      if (nextTiming) {
        cueId = line;
        i++;
        timing = nextTiming;
      }
    }

    if (timing) {
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i] !== '') {
        if (lines[i].trim() !== '') {
          textLines.push(lines[i].trim());
        }
        i++;
      }
      const { speaker, text } = cleanCueLines(textLines);
      if (text) {
        cues.push({
          Id: cueId || `cue-${cues.length + 1}`,
          StartMs: timing.startMs,
          EndMs: timing.endMs,
          ...(speaker ? { SpeakerLabel: speaker } : {}),
          Text: text,
        });
      }
      continue;
    }
    i++;
  }
  return cues;
}

interface ParsedMediaRoute {
  url: URL;
  isRelativePath: boolean;
  mediaBasePath: string;
  fileId: string;
  filename?: string;
}

function parseMediaRoute(src: string): ParsedMediaRoute | null {
  const trimmed = String(src ?? '').trim();
  if (!trimmed || !trimmed.includes('/media/')) return null;

  const isRelativePath = trimmed.startsWith('/') && !trimmed.startsWith('//');
  const fallbackOrigin =
    typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost';

  let url: URL;
  try {
    url = new URL(trimmed, fallbackOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const segments = url.pathname.split('/').filter((seg) => seg.length > 0);
  let mediaIdx = -1;
  for (let i = segments.length - 2; i >= 0; i--) {
    if (segments[i] === 'media') {
      mediaIdx = i;
      break;
    }
  }
  if (mediaIdx < 0) return null;

  const trailingCount = segments.length - (mediaIdx + 1);
  if (trailingCount !== 1 && trailingCount !== 2) return null;

  const fileId = segments[mediaIdx + 1];
  if (!fileId || fileId === 'upload-stage' || !SAFE_FILE_ID_RE.test(fileId)) return null;

  const filename = trailingCount === 2 ? segments[mediaIdx + 2] : undefined;
  const mediaBasePath = '/' + segments.slice(0, mediaIdx + 1).join('/');
  return { url, isRelativePath, mediaBasePath, fileId, filename };
}

function hasVideoExtension(filename: string | undefined): boolean {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return VIDEO_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isVideoMediaRoute(route: ParsedMediaRoute): boolean {
  const kind = (route.url.searchParams.get('kind') ?? '').trim().toLowerCase();
  return kind === 'video' || hasVideoExtension(route.filename);
}

function extractCaptionUrl(route: ParsedMediaRoute): string | null {
  const vttId = (route.url.searchParams.get('vtt') ?? '').trim();
  const vttToken = (route.url.searchParams.get('vttToken') ?? '').trim();
  if (!vttId || !vttToken || !SAFE_FILE_ID_RE.test(vttId)) return null;

  const prefix = route.isRelativePath ? '' : route.url.origin;
  return `${prefix}${route.mediaBasePath}/${encodeURIComponent(vttId)}?token=${encodeURIComponent(vttToken)}`;
}

function extractInitialStartSeconds(url: URL): number | null {
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const rawT = params.get('t');
  if (!rawT) return null;
  const startPart = rawT.split(',')[0] ?? '';
  return ParseInlineMediaTimestampSeconds(startPart);
}

function buildInteractiveTranscriptDrawer(
  doc: Document,
  video: HTMLVideoElement,
  captionUrl: string,
): HTMLDetailsElement {
  const details = doc.createElement('details');
  details.className = 'mj-markdown-video__transcript';

  const summary = doc.createElement('summary');
  summary.className = 'mj-markdown-video__transcript-summary';
  summary.textContent = 'Interactive transcript (click any line to jump)';
  details.appendChild(summary);

  const list = doc.createElement('div');
  list.className = 'mj-markdown-video__cues';
  details.appendChild(list);

  let loaded = false;
  const loadCues = async (): Promise<void> => {
    if (loaded) return;
    loaded = true;
    if (typeof fetch !== 'function') return;
    try {
      const response = await fetch(captionUrl);
      if (!response.ok) return;
      const vttText = await response.text();
      const cues = ParseInlineMediaCues(vttText);
      if (cues.length === 0) {
        details.remove();
        return;
      }

      const buttons: HTMLButtonElement[] = [];
      for (const cue of cues) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'mj-markdown-video__cue';
        btn.dataset['startMs'] = String(cue.StartMs);
        btn.dataset['endMs'] = String(cue.EndMs ?? cue.StartMs + 5000);

        const timeSpan = doc.createElement('span');
        timeSpan.className = 'mj-markdown-video__cue-time';
        timeSpan.textContent = FormatInlineMediaTimestamp(cue.StartMs);
        btn.appendChild(timeSpan);

        const textSpan = doc.createElement('span');
        textSpan.className = 'mj-markdown-video__cue-text';
        textSpan.textContent = cue.SpeakerLabel ? `${cue.SpeakerLabel}: ${cue.Text}` : cue.Text;
        btn.appendChild(textSpan);

        btn.addEventListener('click', () => {
          video.currentTime = cue.StartMs / 1000;
          const playPromise = video.play?.();
          if (playPromise && typeof playPromise.catch === 'function') {
            void playPromise.catch(() => {
              /* autoplay policy block is fine; seek still completed */
            });
          }
        });
        list.appendChild(btn);
        buttons.push(btn);
      }

      video.addEventListener('timeupdate', () => {
        const nowMs = video.currentTime * 1000;
        for (let idx = 0; idx < cues.length; idx++) {
          const cue = cues[idx];
          const nextStart = cues[idx + 1]?.StartMs ?? cue.EndMs ?? cue.StartMs + 5000;
          const endMs = cue.EndMs ?? nextStart;
          const active = nowMs >= cue.StartMs && nowMs < endMs;
          buttons[idx]?.classList.toggle('mj-markdown-video__cue--active', active);
        }
      });
    } catch {
      /* transcript drawer is a progressive enhancement over the native <track> */
    }
  };

  // Fetch cues lazily only when the reader expands the <details> drawer so conversation
  // history rendering never fires background HTTP fetches for collapsed transcripts.
  details.addEventListener('toggle', () => {
    if (details.open) {
      void loadCues();
    }
  });

  return details;
}

/**
 * Upgrade rendered `<img src=".../media/:fileId?...">` elements marked with `kind=video` (or a
 * video filename segment) inside `container` into inline HTML5 `<video>` players with optional
 * WebVTT `<track>` captions and a lazy click-to-seek transcript drawer.
 */
export function UpgradeInlineMediaElements(container: HTMLElement | null | undefined): void {
  if (!container || typeof document === 'undefined') return;
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img[src*="/media/"]'));
  for (const img of images) {
    if (img.closest('a')) continue;
    const src = img.getAttribute('src') ?? '';
    const route = parseMediaRoute(src);
    if (!route || !isVideoMediaRoute(route)) continue;

    const doc = img.ownerDocument ?? document;
    const wrapper = doc.createElement('div');
    wrapper.className = 'mj-markdown-video';

    const video = doc.createElement('video');
    video.className = 'mj-markdown-video__player';
    video.setAttribute('src', src);
    video.setAttribute('controls', '');
    video.setAttribute('preload', 'metadata');
    video.setAttribute('playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    const alt = (img.getAttribute('alt') ?? '').trim();
    if (alt) {
      video.setAttribute('title', alt);
    }

    const startSec = extractInitialStartSeconds(route.url);
    if (startSec != null && startSec > 0) {
      video.addEventListener(
        'loadedmetadata',
        () => {
          if (video.currentTime < 0.5) {
            video.currentTime = startSec;
          }
        },
        { once: true },
      );
    }

    const captionUrl = extractCaptionUrl(route);
    if (captionUrl) {
      const track = doc.createElement('track');
      track.setAttribute('kind', 'captions');
      track.setAttribute('srclang', 'en');
      track.setAttribute('label', 'Captions');
      track.setAttribute('default', '');
      track.setAttribute('src', captionUrl);
      video.appendChild(track);
    }

    wrapper.appendChild(video);

    if (captionUrl) {
      wrapper.appendChild(buildInteractiveTranscriptDrawer(doc, video, captionUrl));
    }

    img.replaceWith(wrapper);
  }
}
