import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Input,
    NgZone,
    OnDestroy,
    inject,
} from '@angular/core';
import { LiveKitAudioMeter, AUDIO_METER_BIN_COUNT, type LiveKitParticipantView } from '@memberjunction/livekit-room-core';

/**
 * A compact, animated audio-level visualizer for a single participant. Runs a `requestAnimationFrame`
 * loop OUTSIDE Angular (via {@link NgZone.runOutsideAngular}) reading the live participant audio level and
 * writing bar heights directly to the DOM — so a 60fps meter never triggers change detection.
 */
@Component({
    selector: 'mj-livekit-audio-meter',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="lk-meter" [class.lk-meter--silent]="false" role="presentation" aria-hidden="true">
            @for (bar of bars; track $index) {
                <span class="lk-meter__bar"></span>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: inline-flex;
                align-items: center;
                height: 100%;
            }
            .lk-meter {
                display: flex;
                align-items: center;
                gap: 2px;
                height: 100%;
            }
            .lk-meter__bar {
                display: block;
                width: 3px;
                height: 10%;
                min-height: 2px;
                border-radius: 2px;
                background: var(--mj-brand-primary, #0076b6);
                transform-origin: center;
                transition: background-color 120ms ease;
            }
        `,
    ],
})
export class LiveKitAudioMeterComponent implements OnDestroy {
    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly zone = inject(NgZone);
    private readonly meter = new LiveKitAudioMeter();
    private rafId: number | null = null;
    private participant: LiveKitParticipantView | null = null;

    /** The bar slots to render (count comes from the core constant). */
    public readonly bars = new Array(AUDIO_METER_BIN_COUNT).fill(0);

    /** The participant whose audio level this meter renders. */
    @Input()
    public set Participant(value: LiveKitParticipantView | null) {
        this.participant = value;
        if (value && this.rafId === null) {
            this.startLoop();
        } else if (!value) {
            this.stopLoop();
        }
    }
    public get Participant(): LiveKitParticipantView | null {
        return this.participant;
    }

    public ngOnDestroy(): void {
        this.stopLoop();
    }

    /** Starts the rAF loop outside Angular so the high-frequency meter never schedules change detection. */
    private startLoop(): void {
        this.zone.runOutsideAngular(() => {
            const tick = (): void => {
                this.renderFrame();
                this.rafId = requestAnimationFrame(tick);
            };
            this.rafId = requestAnimationFrame(tick);
        });
    }

    /** Reads the latest audio level, smooths it, and writes bar heights to the DOM directly. */
    private renderFrame(): void {
        const level = this.participant?.Raw.audioLevel ?? 0;
        const frame = this.meter.Next(level);
        const root = this.host.nativeElement as HTMLElement;
        const barEls = root.querySelectorAll<HTMLElement>('.lk-meter__bar');
        for (let i = 0; i < barEls.length; i++) {
            const pct = Math.max(0.1, frame.Bins[i] ?? 0);
            barEls[i].style.height = `${Math.round(pct * 100)}%`;
        }
    }

    /** Cancels the rAF loop. */
    private stopLoop(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}
