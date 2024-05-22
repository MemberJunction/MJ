import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Markdown
import { MarkdownModule } from 'ngx-markdown';

// LOCAL
import { ChatComponent } from './chat/chat.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogModule } from '@progress/kendo-angular-dialog';

@NgModule({
  declarations: [
    ChatComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ContainerDirectivesModule,
    IndicatorsModule,
    ButtonsModule,
    DialogModule,
    MarkdownModule.forRoot()
  ],
  exports: [
    ChatComponent
  ]
})
export class ChatModule { }