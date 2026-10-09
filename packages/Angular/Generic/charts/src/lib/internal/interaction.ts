import { ActivePoint } from './geometry.types';
import { SamePoint } from './hit-test';

export type PointerKind = 'mouse' | 'touch' | 'pen';

/**
 * Pointer / touch / keyboard state for one chart (spec §10.2).
 * Touch: first tap arms and shows the value; a second tap on the same point
 * emits. The synthetic click a browser fires after a touch never emits.
 */
export class ChartInteraction {
    private active: ActivePoint | null = null;
    private tooltipOpen = false;
    private keyboard = false;
    private armed: ActivePoint | null = null;
    private suppressNextClick = false;

    public get Active(): ActivePoint | null { return this.active; }
    public get TooltipOpen(): boolean { return this.tooltipOpen; }
    public get KeyboardActive(): boolean { return this.keyboard; }

    public Hover(point: ActivePoint | null): void {
        this.active = point;
        this.tooltipOpen = point !== null;
        this.keyboard = false;
    }

    /** No-op during keyboard navigation: pointer drift or a pending grace timer must not wipe a keyboard selection. */
    public Leave(): void {
        if (this.keyboard) {
            return;
        }
        this.active = null;
        this.tooltipOpen = false;
        this.armed = null;
    }

    public PointerUp(point: ActivePoint | null, kind: PointerKind): 'emit' | 'arm' | 'none' {
        if (kind !== 'touch') {
            this.suppressNextClick = false;
            return 'none';
        }
        this.suppressNextClick = true;
        if (point === null) {
            // Tapping empty space dismisses a touch selection; keyboard owns its own point.
            this.armed = null;
            if (!this.keyboard) {
                this.active = null;
                this.tooltipOpen = false;
            }
            return 'none';
        }
        if (SamePoint(this.armed, point)) {
            this.armed = null;
            return 'emit';
        }
        this.armed = point;
        this.active = point;
        this.tooltipOpen = true;
        this.keyboard = false;
        return 'arm';
    }

    public Click(point: ActivePoint | null): 'emit' | 'none' {
        if (this.suppressNextClick) {
            this.suppressNextClick = false;
            return 'none';
        }
        return point === null ? 'none' : 'emit';
    }

    public Navigate(point: ActivePoint | null): void {
        this.active = point;
        this.tooltipOpen = point !== null;
        this.keyboard = point !== null;
        this.armed = null;
    }

    public Dismiss(): void {
        this.tooltipOpen = false;
    }

    public Blur(): void {
        this.Reset();
    }

    public Reset(): void {
        this.active = null;
        this.tooltipOpen = false;
        this.keyboard = false;
        this.armed = null;
    }
}
