/**
 * DAG-native Time-Machine VCR debug bar: Continue / Step Next / Step Wave / Pause / Stop,
 * plus optional X-Ray (`X`), Blast-Radius preview, Engine Pulse, and Breakpoints badge.
 *
 * Intent only. The host owns Pause/Resume/Step Remote Operations. This widget never imports
 * a transport, so the same bar can sit in the test harness and on the Explorer run console.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
    standalone: true,
    selector: 'mj-task-graph-debug-toolbar',
    templateUrl: './task-graph-debug-toolbar.component.html',
    styleUrls: ['./task-graph-debug-toolbar.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskGraphDebugToolbarComponent {
    /** Graph is claim-gated. Continue / Step Next / Step Wave show; Pause hides. */
    @Input() public Paused = false;
    /** A control is in flight — buttons disable, they do not vanish. */
    @Input() public Busy = false;
    /** False when the graph has settled or there is nothing to drive. */
    @Input() public Enabled = true;
    /** Every step is terminal — Play/Step hide; Finished is the state. */
    @Input() public Settled = false;
    /** Optional X-Ray mode toggle state (hotkey `X`). */
    @Input() public XRayEnabled = false;
    /** Show the X-Ray toggle button on this bar. */
    @Input() public ShowXRayToggle = false;
    /** Optional What-If Failure Blast-Radius highlight toggle state. */
    @Input() public BlastRadiusEnabled = false;
    /** Show the Blast-Radius toggle button on this bar. */
    @Input() public ShowBlastRadiusToggle = false;
    /** Optional live dispatcher pulse summary (e.g. `#418 · 2 ready · 0 held`). */
    @Input() public EnginePulseText: string | null = null;
    /** Optional count of armed breakpoints (single + remembered). */
    @Input() public BreakpointCount = 0;

    @Output() public Pause = new EventEmitter<void>();
    @Output() public Resume = new EventEmitter<void>();
    @Output() public Step = new EventEmitter<void>();
    @Output() public StepWave = new EventEmitter<void>();
    @Output() public Cancel = new EventEmitter<void>();
    @Output() public XRayToggled = new EventEmitter<boolean>();
    @Output() public BlastRadiusToggled = new EventEmitter<boolean>();

    @HostListener('document:keydown', ['$event'])
    public OnHotkey(event: KeyboardEvent): void {
        if (isToolbarTypingTarget(event.target)) return;
        if (this.ShowXRayToggle && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'x') {
            event.preventDefault();
            this.XRayToggled.emit(!this.XRayEnabled);
            return;
        }
        if (!this.Enabled || this.Busy || this.Settled) return;
        if (event.key === 'F5' && event.shiftKey) {
            event.preventDefault();
            this.Cancel.emit();
            return;
        }
        if (event.key === 'F5') {
            event.preventDefault();
            if (this.Paused) this.Resume.emit();
            else this.Pause.emit();
            return;
        }
        if (event.key === 'F10') {
            event.preventDefault();
            this.Step.emit();
            return;
        }
        if (event.key === 'F11') {
            event.preventDefault();
            this.StepWave.emit();
        }
    }
}

function isToolbarTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
