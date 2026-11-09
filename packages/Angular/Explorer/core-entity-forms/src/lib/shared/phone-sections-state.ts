import { IsPhoneViewport, WatchPhoneViewport } from '@memberjunction/ng-ui-components';

/**
 * A form's phone-sections state (design call 7A): whether the viewport is phone width, and
 * which section shows behind the picker. Bind it to `mj-accordion-sections`:
 *
 * ```html
 * <mj-accordion-sections [Enabled]="Phone.IsPhone" [ActiveKey]="Phone.Section" (ActiveKeyChange)="Phone.Pick($event)">
 * ```
 *
 * It follows the breakpoint live (rotation, resize, DevTools device mode) until `Stop()`, which
 * the form calls from `ngOnDestroy`. `onChange` runs after every change, usually
 * `() => this.cdr.markForCheck()`.
 */
export class PhoneSectionsState {
    /** Phone width right now. */
    public IsPhone = IsPhoneViewport();
    /** The section showing on a phone; null means the first. */
    public Section: string | null = null;
    private readonly stopWatch: () => void;

    constructor(private readonly onChange: () => void) {
        this.stopWatch = WatchPhoneViewport(() => this.Sync());
    }

    /** Re-reads the breakpoint. */
    public Sync(): void {
        this.IsPhone = IsPhoneViewport();
        this.onChange();
    }

    /** The section the user picked. */
    public Pick(key: string): void {
        this.Section = key;
        this.onChange();
    }

    /** Stops following the breakpoint. */
    public Stop(): void {
        this.stopWatch();
    }
}
