import { Component } from '@angular/core';
import { ConversationComponent } from './conversation/conversation.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ConversationComponent],
  template: '<app-conversation></app-conversation>',
  styles: []
})
export class AppComponent {
  title = 'audio-chat';
}
