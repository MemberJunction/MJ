/**
 * @fileoverview Default `demonstrationSurface` slot component — no-op by default.
 *
 * The `demonstrationSurface` slot is intended for full-width adjacent content
 * the agent is "walking through" — annotated lesson material, step-by-step
 * screenshots, a paused video frame with arrows pointing at relevant regions,
 * etc. By default it renders nothing; consumers project their own template or
 * subclass this default to populate the surface.
 *
 * @module @memberjunction/ng-conversations
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import type { IMJChatDemonstrationSurfaceComponent } from './slot-interfaces';

@Component({
    selector: 'mj-chat-demonstration-surface-default',
    standalone: true,
    imports: [CommonModule],
    template: ``,
})
export class MJChatDemonstrationSurfaceDefaultComponent
    implements IMJChatDemonstrationSurfaceComponent
{
    @Input() public Content?: unknown;
    @Input() public Visible: boolean = false;
}
