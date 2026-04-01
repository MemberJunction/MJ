import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatModule } from '@memberjunction/ng-chat';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { ChatOverlayComponent } from './chat-overlay.component';

@NgModule({
    declarations: [
        ChatOverlayComponent
    ],
    imports: [
        CommonModule,
        ChatModule,
        SharedGenericModule
    ],
    exports: [
        ChatOverlayComponent
    ]
})
export class ChatOverlayModule { }
