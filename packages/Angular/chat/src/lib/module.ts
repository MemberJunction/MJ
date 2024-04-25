import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Markdown
import { MarkdownModule } from 'ngx-markdown';

// LOCAL
import { ChatComponent } from './chat/chat.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

@NgModule({
  declarations: [
    ChatComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ContainerDirectivesModule,
    IndicatorsModule,
    MarkdownModule.forRoot()
  ],
  exports: [
    ChatComponent
  ]
})
export class ChatModule { }