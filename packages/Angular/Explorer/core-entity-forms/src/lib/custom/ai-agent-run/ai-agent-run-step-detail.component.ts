import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { TimelineItem } from './ai-agent-run-timeline.component';
import { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';

@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-step-detail',
  templateUrl: './ai-agent-run-step-detail.component.html',
  styleUrls: ['./ai-agent-run-step-detail.component.css']
})
export class AIAgentRunStepDetailComponent {
  @Input() selectedTimelineItem: TimelineItem | null = null;
  @Output() closePanel = new EventEmitter<void>();
  @Output() navigateToActionLog = new EventEmitter<string>();
  @Output() copyToClipboard = new EventEmitter<string>();

  selectedItemJsonString = '{}';
  detailPaneTab: 'json' | 'diff' = 'diff';

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges() {
    if (this.selectedTimelineItem) {
      this.selectedItemJsonString = this.getSelectedItemJson();
      // Default to diff tab if step has payload diff, otherwise json tab
      this.detailPaneTab = this.showStepPayloadDiff ? 'diff' : 'json';
      this.cdr.detectChanges();
    }
  }

  getSelectedItemJson(): string {
    if (!this.selectedTimelineItem) return '{}';
    
    // Get all the data from the entity
    let data;
    if (this.selectedTimelineItem.data instanceof MJAIAgentRunStepEntity) {
      // If it's a step entity, we need to get the full run data
      data = this.selectedTimelineItem.data.GetAll();
    } else {
      data = this.selectedTimelineItem.data;
    }
    
    // Apply recursive JSON parsing to the entire data object
    const parseOptions: ParseJSONOptions = {
      extractInlineJson: true,
      maxDepth: 100,
      debug: false
    };
    const parsedData = ParseJSONRecursive(data, parseOptions);
    
    return JSON.stringify(parsedData, null, 2);
  }

  /**
   * Check if selected timeline item is a step with payload changes
   */
  get showStepPayloadDiff(): boolean {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return false;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (stepData && (stepData.PayloadAtStart?.trim().length > 0 
                 || stepData.PayloadAtEnd?.trim().length > 0)) {
      return stepData.PayloadAtStart !== stepData.PayloadAtEnd;
    } else {
      return false;
    }
  }

  /**
   * Get parsed PayloadAtStart for the selected step
   */
  get stepPayloadAtStartObject(): any {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return null;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (!stepData?.PayloadAtStart) return null;
    
    try {
      // First, check if PayloadAtStart is a JSON string that needs to be parsed
      let payloadData = stepData.PayloadAtStart;
      try {
        // If PayloadAtStart is a JSON string, parse it first
        payloadData = JSON.parse(stepData.PayloadAtStart);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = stepData.PayloadAtStart;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get parsed PayloadAtEnd for the selected step
   */
  get stepPayloadAtEndObject(): any {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return null;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (!stepData?.PayloadAtEnd) return null;
    
    try {
      // First, check if PayloadAtEnd is a JSON string that needs to be parsed
      let payloadData = stepData.PayloadAtEnd;
      try {
        // If PayloadAtEnd is a JSON string, parse it first
        payloadData = JSON.parse(stepData.PayloadAtEnd);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = stepData.PayloadAtEnd;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  onClosePanel() {
    this.closePanel.emit();
  }

  onNavigateToActionLog(logId: string) {
    this.navigateToActionLog.emit(logId);
  }

  onCopyToClipboard() {
    this.copyToClipboard.emit(this.getSelectedItemJson());
  }
}