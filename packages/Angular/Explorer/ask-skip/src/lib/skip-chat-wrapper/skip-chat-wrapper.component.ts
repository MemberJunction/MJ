import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
 

/**
 * Simple wrapper component to handle generic Skip Chat component events and handle within MJ Explorer
 */
@Component({
  selector: 'mj-skip-chat-wrapper',
  templateUrl: './skip-chat-wrapper.component.html',
  styleUrls: ['./skip-chat-wrapper.component.css']
})
export class SkipChatWrapperComponent {  
  constructor (private router: Router, private location: Location) {  }

  public NavigateToMatchingReport(reportId: string) {
    this.router.navigate(['resource', 'report', reportId]);
  }

  public ConversationSelected(conversationId: string) {
    this.location.go(`/askskip/${conversationId}`);
  }
}
