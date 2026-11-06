import { AttachVideoSource, type MediaVideoSource } from '@memberjunction/ai-realtime-client/media';

/**
 * Keeps one video source attached to one `<video>` element. Binding a different source detaches the old one first;
 * binding the same source again does nothing, so a playing video does not restart.
 */
export class MediaVideoBinding {
  private attached: { Source: MediaVideoSource; Detach: () => void } | null = null;

  /** The source attached now, or `null`. */
  public get Source(): MediaVideoSource | null {
    return this.attached?.Source ?? null;
  }

  /** Attaches `source` to `element`; with either missing, detaches whatever is attached. */
  public Bind(source: MediaVideoSource | null, element: HTMLVideoElement | undefined): void {
    const next = element ? source : null;
    if (this.Source === next) {
      return;
    }
    this.Release();
    if (next && element) {
      this.attached = { Source: next, Detach: AttachVideoSource(next, element) };
    }
  }

  /** Detaches whatever is attached. */
  public Release(): void {
    this.attached?.Detach();
    this.attached = null;
  }
}
