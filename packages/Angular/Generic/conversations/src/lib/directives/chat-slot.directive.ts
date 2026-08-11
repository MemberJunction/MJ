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

/**
 * Named slots the chat-area exposes. Keep in sync with the slot-interfaces module.
 *
 * Note the header pair: `header` REPLACES the entire chat header (the consumer
 * owns title, badges, and every action button), while `headerActions` is
 * ADDITIVE — it renders the projected template inside the DEFAULT header's
 * action strip, after the stock buttons. Projecting `header` suppresses
 * `headerActions` (the replacement owns the whole header, actions included).
 *
 * `composerActions` is the composer's equivalent of `headerActions`: ADDITIVE
 * buttons in the composer's own action strip, rendered after the stock Plan
 * Mode / attach / voice controls. It exists because that strip was previously
 * closed — the composer takes booleans (`enablePlanMode`, `enableAttachments`,
 * …) and emits events, with no `ng-content` anywhere in the chain — so a host
 * wanting one more control beside Plan Mode had nowhere to put it and had to
 * either park the control elsewhere in the page or reach into MJ's internals
 * with CSS. The strip renders whenever this slot is filled, even with every
 * stock control disabled.
 */
export type MJChatSlotName =
    | 'emptyState'
    | 'agentPresence'
    | 'header'
    | 'headerActions'
    | 'composerActions'
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
