import { Component, Input, Output, EventEmitter } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { PendingAttachment } from '../mention/mention-editor.component';

@Component({
  standalone: false,
  selector: 'mj-conversation-empty-state',
  templateUrl: './conversation-empty-state.component.html',
  styleUrls: ['./conversation-empty-state.component.css']
})
export class ConversationEmptyStateComponent {
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;
  @Input() showSidebarToggle: boolean = false;

  @Output() messageSent = new EventEmitter<{text: string; attachments: PendingAttachment[]}>();
  @Output() sidebarToggleClicked = new EventEmitter<void>();

  public messageText: string = '';

  // All available suggested prompts (business user focused)
  private allSuggestedPrompts: Array<{icon: string; title: string; prompt: string}> = [
    // Data Analysis & Insights
    {
      icon: 'fa-clock-rotate-left',
      title: 'Recent changes',
      prompt: 'Show me what\'s changed in my data recently'
    },
    {
      icon: 'fa-list-check',
      title: 'Pending items',
      prompt: 'Find all my incomplete or pending items'
    },
    {
      icon: 'fa-magnifying-glass',
      title: 'Search everything',
      prompt: 'Search everything in my system for a specific topic'
    },
    {
      icon: 'fa-clipboard-check',
      title: 'Data quality',
      prompt: 'Analyze my data and find duplicates or inconsistencies'
    },
    {
      icon: 'fa-inbox',
      title: 'Catch up',
      prompt: 'Create a summary of activity while I was away'
    },

    // Research & Information Gathering
    {
      icon: 'fa-download',
      title: 'Research & save',
      prompt: 'Research a topic and save the findings to my database'
    },
    {
      icon: 'fa-code-compare',
      title: 'Compare sources',
      prompt: 'Compare my data with information from the web'
    },
    {
      icon: 'fa-folder-open',
      title: 'Search files',
      prompt: 'Search my files and documents for related information'
    },
    {
      icon: 'fa-layer-group',
      title: 'Multi-source search',
      prompt: 'Find relevant information across all my data sources'
    },
    {
      icon: 'fa-sitemap',
      title: 'Comprehensive research',
      prompt: 'Gather information on a topic from multiple sources'
    },

    // Automation & Agent Building
    {
      icon: 'fa-calendar-day',
      title: 'Daily summaries',
      prompt: 'Create an agent to send me daily data summaries'
    },
    {
      icon: 'fa-bell',
      title: 'Change alerts',
      prompt: 'Build an agent that monitors data changes and alerts me'
    },
    {
      icon: 'fa-file-chart-column',
      title: 'Automated reports',
      prompt: 'Design an agent to aggregate data and create reports'
    },
    {
      icon: 'fa-arrows-rotate',
      title: 'Data sync',
      prompt: 'Help me create an agent that syncs data with external systems'
    },
    {
      icon: 'fa-file-import',
      title: 'File processor',
      prompt: 'Build an agent that processes files and updates my database'
    },
    {
      icon: 'fa-slack',
      title: 'Slack notifications',
      prompt: 'Create an agent to post updates to Slack when data changes'
    },
    {
      icon: 'fa-broom',
      title: 'Data cleanup',
      prompt: 'Design an agent that validates and cleans up my data regularly'
    },
    {
      icon: 'fa-chart-pie',
      title: 'Auto visualizations',
      prompt: 'Build an agent that generates visualizations from my data'
    },
    {
      icon: 'fa-graduation-cap',
      title: 'Research compiler',
      prompt: 'Create an agent to research topics and compile findings'
    },
    {
      icon: 'fa-diagram-project',
      title: 'Workflow automation',
      prompt: 'Help me design a workflow agent with approval steps'
    }
  ];

  // Randomly selected prompts to display (refreshed on each load)
  public suggestedPrompts: Array<{icon: string; title: string; prompt: string}> = [];

  constructor() {
    // Select 4 random prompts on initialization
    this.suggestedPrompts = this.selectRandomPrompts(4);
  }

  /**
   * Select random prompts from the full list
   */
  private selectRandomPrompts(count: number): Array<{icon: string; title: string; prompt: string}> {
    const shuffled = [...this.allSuggestedPrompts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  onEmptyStateSubmit(event: {text: string; attachments: PendingAttachment[]}): void {
    this.messageSent.emit(event);
  }

  onSuggestedPromptClicked(prompt: string): void {
    if (!this.disabled) {
      this.messageSent.emit({ text: prompt, attachments: [] });
    }
  }
}
