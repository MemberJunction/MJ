import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { EnvironmentEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

/**
 * Wrapper component for the conversations interface within MJ Explorer
 * Integrates the generic @memberjunction/ng-conversations package with Explorer routing
 * Handles route params for conversation, library, and task context
 */
@Component({
  selector: 'mj-chat-wrapper',
  template: `
    <div class="chat-wrapper" *ngIf="currentUser">
      <mj-conversation-workspace
        [environmentId]="environmentId"
        [initialConversationId]="conversationId"
        [currentUser]="currentUser"
        [layout]="'full'"
        [activeContext]="activeContext"
        [contextItemId]="contextItemId"
        (openEntityRecord)="onOpenEntityRecord($event)">
      </mj-conversation-workspace>
    </div>
  `,
  styles: [`
    .chat-wrapper {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class ChatWrapperComponent implements OnInit {
  public environmentId: string = '';
  public conversationId?: string;
  public activeContext?: 'library' | 'task';
  public contextItemId?: string;
  public currentUser: any = null;

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    this.environmentId = EnvironmentEntityExtended.DefaultEnvironmentID;

    // Subscribe to route params for conversation and context navigation
    this.route.params.subscribe(params => {
      if (params['conversationId']) {
        this.conversationId = params['conversationId'];
      }

      // Handle context (library or task) and contextItemId
      if (params['context']) {
        const context = params['context'];
        if (context === 'library' || context === 'task') {
          this.activeContext = context;
        }
      } else {
        this.activeContext = undefined;
      }

      if (params['itemId']) {
        this.contextItemId = params['itemId'];
      } else {
        this.contextItemId = undefined;
      }
    });
  }

  /**
   * Handle openEntityRecord event from conversation components
   * Opens the specified entity record in a new tab using SharedService
   */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    SharedService.Instance.OpenEntityRecord(event.entityName, event.compositeKey);
  }
}