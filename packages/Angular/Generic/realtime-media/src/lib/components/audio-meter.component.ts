import { ChangeDetectionStrategy, Component, ElementRef, Input, NgZone, OnDestroy, inject } from '@angular/core';
import { AudioLevelSmoother, type AudioLevelSmootherOptions } from '@memberjunction/ai-realtime-client/media';

/** How a meter smooths the level: its bar count, attack, decay and silence floor. Unset values take the defaults. */
export type MediaAudioMeterSettings = Partial<AudioLevelSmootherOptions>;

/** Bars when the settings name no count. */
const DEFAULT_BAR_COUNT = 7;

/** The shortest a bar gets, as a fraction of the meter's height, so a silent meter still shows its bars. */
const MIN_BAR_HEIGHT = 0.1;

/**
 * `mj-audio-meter`: a compact, animated level meter. It polls {@link Level} on every animation frame outside
 * Angular and writes the bar heights straight to the DOM, so a 60 fps meter never runs change detection.
 * Smoothing is the shared `AudioLevelSmoother`; each host passes its own {@link Settings}.
 */
@Component({
  selector: 'mj-audio-meter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter" role="presentation" aria-hidden="true">
      @for (bar of Bars; track $index) {
        <span class="meter__bar"></span>
      }
    </div>
  `,
  styleUrls: ['./audio-meter.component.css'],
})
export class MediaAudioMeterComponent implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private level: (() => number) | null = null;
  private settings: MediaAudioMeterSettings = {};
  private smoother: AudioLevelSmoother | null = null;
  private frame: number | null = null;

  /** One slot per bar. */
  public Bars: readonly number[] = new Array<number>(DEFAULT_BAR_COUNT).fill(0);

  /** Reads the current level, 0..1, on every animation frame. `null` stops the meter. */
  @Input()
  public set Level(value: (() => number) | null) {
    this.level = value;
    if (value) {
      this.start();
    } else {
      this.stop();
    }
  }
  public get Level(): (() => number) | null {
    return this.level;
  }

  /** The smoothing settings. A change starts the bars over. */
  @Input()
  public set Settings(value: MediaAudioMeterSettings) {
    this.settings = value ?? {};
    this.Bars = new Array<number>(this.barCount).fill(0);
    this.smoother = null;
  }
  public get Settings(): MediaAudioMeterSettings {
    return this.settings;
  }

  public ngOnDestroy(): void {
    this.stop();
  }

  private get barCount(): number {
    return this.settings.BarCount ?? DEFAULT_BAR_COUNT;
  }

  private start(): void {
    if (this.frame !== null) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      const tick = (): void => {
        this.render();
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  private stop(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  /** Smooths the latest level and sets each bar's height. */
  private render(): void {
    this.smoother ??= new AudioLevelSmoother({ ...this.settings, BarCount: this.barCount });
    const frame = this.smoother.Next(this.level?.() ?? 0);
    const bars = this.host.nativeElement.querySelectorAll<HTMLElement>('.meter__bar');
    bars.forEach((bar, i) => {
      bar.style.height = `${Math.round(Math.max(MIN_BAR_HEIGHT, frame.Bars[i] ?? 0) * 100)}%`;
    });
  }
}
