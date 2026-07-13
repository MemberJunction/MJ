/**
 * @fileoverview ChatSlotDirective — content-projection lookup for chat-area slots.
 *
 * Consumers project a template into a specific slot by attaching this directive:
 *
 * ```html
 * <mj-conversation-chat-area>
 *   <ng-template mjChatSlot="emptyState">
 *     <warm-tutor-welcome />
 *   </ng-template>
 *
 *   <ng-template mjChatSlot="agentPresence" let-state>
 *     <my-character-presence [State]="state" />
 *   </ng-template>
 * </mj-conversation-chat-area>
 * ```
 *
 * The chat-area component queries `@ContentChildren(ChatSlotDirective)` and
 * looks up the `TemplateRef` for each known slot name. When a consumer template
 * is present for a slot, the component renders it via `*ngTemplateOutlet`
 * (with a typed context); when absent, the component falls back to its
 * exported standalone default component for that slot.
 *
 * @module @memberjunction/ng-conversations
 */

import { Directive, Input, TemplateRef } from '@angular/core';

/** Named slots the chat-area exposes. Keep in sync with the slot-interfaces module. */
export type MJChatSlotName =
    | 'emptyState'
    | 'agentPresence'
    | 'header'
    | 'messageExtra'
    | 'demonstrationSurface'
    | 'messageRenderer';

/**
 * Marks an `<ng-template>` as a slot fill for the chat-area.
 *
 * Standalone — no module declaration required; consumers import it as part of
 * the conversations module's exports.
 */
@Directive({
    selector: '[mjChatSlot]',
    standalone: true,
})
export class ChatSlotDirective {
    /** Which slot this template fills. */
    @Input('mjChatSlot') public SlotName!: MJChatSlotName;

    constructor(public readonly Template: TemplateRef<unknown>) {}
}
