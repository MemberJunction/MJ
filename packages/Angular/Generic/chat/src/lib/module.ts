import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Markdown
import { MarkdownModule } from '@memberjunction/ng-markdown';

// LOCAL
import { ChatComponent } from './chat/chat.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { DialogModule } from '@progress/kendo-angular-dialog'; // kept for kendo-dialog — Phase 2.2
import { MjButtonDirective } from '@memberjunction/ng-ui-components';

@NgModule({
  declarations: [
    ChatComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    DialogModule,
    MjButtonDirective,
    MarkdownModule
  ],
  exports: [
    ChatComponent
  ]
})
export class ChatModule { }