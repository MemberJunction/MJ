import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TimelineItem } from './ai-agent-run-timeline.component';

@Component({
  selector: 'mj-ai-agent-run-step-node',
  templateUrl: './ai-agent-run-step-node.component.html',
  styleUrls: ['./ai-agent-run-step-node.component.css']
})
export class AIAgentRunStepNodeComponent {
  @Input() item!: TimelineItem;
  @Input() isSelected = false;
  @Output() itemClick = new EventEmitter<TimelineItem>();
  @Output() expandToggle = new EventEmitter<Event>();
  @Output() navigateToEntity = new EventEmitter<{ entityName: string; recordId: string }>();

  get hasChildren(): boolean {
    return !!this.item.children && this.item.children.length > 0;
  }

  get isSubAgent(): boolean {
    return this.item.type === 'subrun' || (this.item.type === 'step' && this.item.data?.StepType === 'subagent');
  }

  get canNavigateToEntity(): boolean {
    return this.item.type === 'action' || this.item.type === 'prompt' || this.item.type === 'subrun';
  }

  get entityNavigationText(): string {
    switch (this.item.type) {
      case 'action':
        return 'View Action Log';
      case 'prompt':
        return 'View Prompt Run';
      case 'subrun':
        return 'View Agent Run';
      default:
        return 'View Details';
    }
  }

  getStatusIcon(status: string): string {
    const iconMap: Record<string, string> = {
      'Running': 'fa-circle-notch fa-spin',
      'Completed': 'fa-check-circle',
      'Failed': 'fa-times-circle',
      'Cancelled': 'fa-ban',
      'Paused': 'fa-pause-circle'
    };
    return iconMap[status] || 'fa-question-circle';
  }

  handleClick() {
    this.itemClick.emit(this.item);
  }

  handleExpandToggle(event: Event) {
    console.log('🔄 StepNode: Expand toggle clicked:', {
      itemId: this.item.id,
      itemType: this.item.type,
      isSubAgent: this.isSubAgent,
      stepType: this.item.data?.StepType,
      hasChildren: this.hasChildren,
      currentExpanded: this.item.isExpanded
    });
    if (this.isSubAgent) {
      this.expandToggle.emit(event);
    }
  }

  navigateToRecord(event: Event) {
    event.stopPropagation();
    
    if (!this.canNavigateToEntity) return;

    let entityName = '';
    let recordId = this.item.id;

    switch (this.item.type) {
      case 'action':
        entityName = 'Action Execution Logs';
        break;
      case 'prompt':
        entityName = 'MJ: AI Prompt Runs';
        break;
      case 'subrun':
        entityName = 'MJ: AI Agent Runs';
        break;
    }

    if (entityName) {
      this.navigateToEntity.emit({ entityName, recordId });
    }
  }

  getAdditionalInfo(): string {
    if (this.item.type === 'step' && this.item.data) {
      const step = this.item.data;
      const parts = [];
      
      if (step.TargetActionName) {
        parts.push(`Action: ${step.TargetActionName}`);
      }
      if (step.Error) {
        parts.push('Error occurred');
      }
      
      return parts.join(' • ');
    }
    
    if (this.item.type === 'action' && this.item.data) {
      const log = this.item.data;
      if (log.Message) {
        return log.Message.substring(0, 100) + (log.Message.length > 100 ? '...' : '');
      }
    }
    
    return '';
  }
}