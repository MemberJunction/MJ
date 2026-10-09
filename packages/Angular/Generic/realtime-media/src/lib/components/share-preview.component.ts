import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { CapturedDisplaySurface, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { MediaVideoBinding } from '../media-video-binding';

const SURFACE_LABELS: Record<CapturedDisplaySurface, string> = {
  screen: 'Sharing your entire screen',
  window: 'Sharing a window',
  tab: 'Sharing a browser tab',
  unknown: 'Sharing your screen',
};

/**
 * `mj-share-preview`: what the user is sharing, shown whole and not mirrored, labelled with the kind of surface (or the
 * shared panel's name), with Stop sharing and Change. Presentational: the host stops the share, or asks the browser's
 * picker again. Content marked `mjMediaTileActions` sits in the top corner, shown on hover or focus, as on `mj-media-tile`.
 */
@Component({
  selector: 'mj-share-preview',
  standalone: true,
  imports: [MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="share">
      <video #video class="share__video" [class.share__video--hidden]="!Source" autoplay playsinline [muted]="true"></video>
      <span class="share__corner"><ng-content select="[mjMediaTileActions]"></ng-content></span>
      <div class="share__bar">
        <span class="share__label"><i class="fa-solid fa-display" aria-hidden="true"></i> {{ Label }}</span>
        <span class="share__actions">
          <button type="button" mjButton Variant="danger" Size="sm" (click)="StopRequested.emit()">Stop sharing</button>
          @if (ShowChange) {
            <button type="button" mjButton Size="sm" (click)="ChangeRequested.emit()">Change</button>
          }
        </span>
      </div>
    </div>
  `,
  styleUrls: ['./share-preview.component.css'],
})
export class SharePreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;

  private source: MediaVideoSource | null = null;
  private viewReady = false;
  private readonly video = new MediaVideoBinding();

  /** What the user is sharing. A different source replaces the shown one; the same source stays. */
  @Input()
  public set Source(value: MediaVideoSource | null) {
    this.source = value;
    if (this.viewReady) {
      this.video.Bind(value, this.videoRef?.nativeElement);
    }
  }
  public get Source(): MediaVideoSource | null {
    return this.source;
  }

  /** The kind of surface shared, for the label. */
  @Input() public Surface: CapturedDisplaySurface = 'unknown';
  /** The shared panel's name, when the user shares one panel of the page: the label then names it instead of the surface. */
  @Input() public PanelLabel: string | null = null;
  /** Show Change. */
  @Input() public ShowChange = true;

  /** The user asked to stop sharing. */
  @Output() public StopRequested = new EventEmitter<void>();
  /** The user asked to share something else. */
  @Output() public ChangeRequested = new EventEmitter<void>();

  /** What the label says: the shared panel's name ({@link PanelLabel}), else the kind of {@link Surface}. */
  public get Label(): string {
    return this.PanelLabel ? `Sharing a panel: ${this.PanelLabel}` : SURFACE_LABELS[this.Surface];
  }

  public ngAfterViewInit(): void {
    this.viewReady = true;
    this.video.Bind(this.source, this.videoRef?.nativeElement);
  }

  public ngOnDestroy(): void {
    this.video.Release();
  }
}
