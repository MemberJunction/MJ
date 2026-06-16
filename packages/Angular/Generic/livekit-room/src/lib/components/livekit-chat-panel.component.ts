import {
    AfterViewChecked,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import type { LiveKitChatMessage } from '../models';

/**
 * The room chat panel — renders data-channel messages and a composer. Purely presentational: it emits
 * {@link Send} with the composed text and {@link Close}; the host publishes via the controller.
 */
@Component({
    selector: 'mj-livekit-chat-panel',
    standalone: true,
    imports: [FormsModule, DatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="lk-chat">
            <header class="lk-chat__head">
                <span><i class="fa-solid fa-comment"></i> Chat</span>
                <button type="button" class="lk-chat__close" title="Close" (click)="Close.emit()"><i class="fa-solid fa-xmark"></i></button>
            </header>
            <div #scroll class="lk-chat__messages">
                @for (msg of Messages; track $index) {
                    <div class="lk-chat__msg" [class.lk-chat__msg--me]="msg.IsLocal">
                        <div class="lk-chat__meta">
                            <span class="lk-chat__sender">{{ msg.IsLocal ? 'You' : msg.Sender }}</span>
                            <span class="lk-chat__time">{{ msg.Timestamp | date: 'shortTime' }}</span>
                        </div>
                        <div class="lk-chat__bubble">{{ msg.Text }}</div>
                    </div>
                } @empty {
                    <div class="lk-chat__empty">No messages yet.</div>
                }
            </div>
            <form class="lk-chat__composer" (submit)="send($event)">
                <input
                    type="text"
                    class="lk-chat__input"
                    [(ngModel)]="draft"
                    name="draft"
                    autocomplete="off"
                    placeholder="Type a message…"
                />
                <button type="submit" class="lk-chat__send" [disabled]="!draft.trim()" title="Send"><i class="fa-solid fa-paper-plane"></i></button>
            </form>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
            }
            .lk-chat {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: var(--mj-bg-surface, #fff);
                border-left: 1px solid var(--mj-border-default, #e2e8f0);
            }
            .lk-chat__head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 12px;
                font-weight: 600;
                color: var(--mj-text-primary, #334155);
                border-bottom: 1px solid var(--mj-border-subtle, #eef2f7);
            }
            .lk-chat__close {
                border: none;
                background: transparent;
                cursor: pointer;
                color: var(--mj-text-muted, #64748b);
            }
            .lk-chat__messages {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .lk-chat__empty {
                color: var(--mj-text-muted, #64748b);
                font-size: 0.85rem;
                text-align: center;
                margin-top: 16px;
            }
            .lk-chat__msg {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                max-width: 85%;
            }
            .lk-chat__msg--me {
                align-self: flex-end;
                align-items: flex-end;
            }
            .lk-chat__meta {
                display: flex;
                gap: 6px;
                font-size: 0.68rem;
                color: var(--mj-text-muted, #64748b);
                margin-bottom: 2px;
            }
            .lk-chat__bubble {
                padding: 7px 11px;
                border-radius: 12px;
                background: var(--mj-bg-surface-card, #f1f5f9);
                color: var(--mj-text-primary, #334155);
                font-size: 0.88rem;
                word-break: break-word;
            }
            .lk-chat__msg--me .lk-chat__bubble {
                background: var(--mj-brand-primary, #0076b6);
                color: var(--mj-text-inverse, #fff);
            }
            .lk-chat__composer {
                display: flex;
                gap: 8px;
                padding: 10px;
                border-top: 1px solid var(--mj-border-subtle, #eef2f7);
            }
            .lk-chat__input {
                flex: 1;
                padding: 8px 12px;
                border-radius: 999px;
                border: 1px solid var(--mj-border-default, #e2e8f0);
                background: var(--mj-bg-surface, #fff);
                color: var(--mj-text-primary, #334155);
                outline: none;
            }
            .lk-chat__input:focus {
                border-color: var(--mj-border-focus, #0076b6);
            }
            .lk-chat__send {
                width: 38px;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                color: var(--mj-text-inverse, #fff);
                background: var(--mj-brand-primary, #0076b6);
            }
            .lk-chat__send:disabled {
                opacity: 0.5;
                cursor: default;
            }
        `,
    ],
})
export class LiveKitChatPanelComponent implements AfterViewChecked {
    private readonly hostEl = inject(ElementRef<HTMLElement>);
    @ViewChild('scroll') private scrollRef?: ElementRef<HTMLElement>;

    /** The chat messages to render. */
    @Input() public Messages: LiveKitChatMessage[] = [];
    /** Emits the composed text when the user sends. */
    @Output() public Send = new EventEmitter<string>();
    /** Emits when the user closes the panel. */
    @Output() public Close = new EventEmitter<void>();

    /** The current composer draft text. */
    public draft = '';
    private lastCount = 0;

    public ngAfterViewChecked(): void {
        if (this.Messages.length !== this.lastCount) {
            this.lastCount = this.Messages.length;
            const el = this.scrollRef?.nativeElement;
            if (el) {
                el.scrollTop = el.scrollHeight;
            }
        }
    }

    /** Handles the composer submit — emits the trimmed draft and clears it. */
    public send(event: Event): void {
        event.preventDefault();
        const text = this.draft.trim();
        if (text) {
            this.Send.emit(text);
            this.draft = '';
        }
    }
}
