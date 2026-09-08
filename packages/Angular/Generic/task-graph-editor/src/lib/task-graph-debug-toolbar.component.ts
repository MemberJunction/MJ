/**
 * VS Code-style debug chrome: Continue / Pause / Step Over / Step Into / Stop.
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
    /** Graph is claim-gated. Continue / Step show; Pause hides. */
    @Input() public Paused = false;
    /** A control is in flight — buttons disable, they do not vanish. */
    @Input() public Busy = false;
    /** False when the graph has settled or there is nothing to drive. */
    @Input() public Enabled = true;
    /** Every step is terminal — Play/Step hide; Finished is the state. */
    @Input() public Settled = false;

    @Output() public Pause = new EventEmitter<void>();
    @Output() public Resume = new EventEmitter<void>();
    @Output() public Step = new EventEmitter<void>();
    @Output() public StepWave = new EventEmitter<void>();
    @Output() public Cancel = new EventEmitter<void>();

    @HostListener('document:keydown', ['$event'])
    public OnHotkey(event: KeyboardEvent): void {
        if (!this.Enabled || this.Busy || this.Settled) return;
        if (isToolbarTypingTarget(event.target)) return;
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
