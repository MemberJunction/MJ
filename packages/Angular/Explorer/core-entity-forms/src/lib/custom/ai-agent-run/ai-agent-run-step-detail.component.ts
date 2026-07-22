import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { TimelineItem } from './ai-agent-run-timeline.component';
import { MJAIAgentRunStepEntity, MJAIAgentRunStepEntity_AgentSkillInvocation } from '@memberjunction/core-entities';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';

interface ScratchpadSnapshotView {
  notes: string;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    notes?: string;
  }>;
}

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
  detailPaneTab: 'json' | 'diff' | 'scratchpad' | 'skills' = 'diff';
  scratchpadSubTab: 'input' | 'output' | 'diff' = 'diff';

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges() {
    if (this.selectedTimelineItem) {
      this.selectedItemJsonString = this.getSelectedItemJson();
      // Default to diff tab if step has payload diff, skills for Skill steps (the activation IS
      // the story there), scratchpad if available, otherwise json
      if (this.showStepPayloadDiff) {
        this.detailPaneTab = 'diff';
      } else if (this.showSkillsTab && this.selectedTimelineItem.data?.StepType === 'Skill') {
        this.detailPaneTab = 'skills';
      } else if (this.showScratchpadTab) {
        this.detailPaneTab = 'scratchpad';
      } else if (this.showSkillsTab) {
        this.detailPaneTab = 'skills';
      } else {
        this.detailPaneTab = 'json';
      }
      this.scratchpadSubTab = 'diff';
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

  /**
   * Whether the Skills tab should be shown — true when the step has skill-invocation records
   * on its `Skills` column (Skill steps, Prompt steps with skills in effect, and Actions/
   * Sub-Agent steps whose tool was granted through a skill).
   */
  get showSkillsTab(): boolean {
    return this.stepSkillInvocations.length > 0;
  }

  /**
   * Parsed {@link MJAIAgentRunStepEntity_AgentSkillInvocation} records from the step's `Skills`
   * JSON column. Empty array when the step has no skill linkage or the JSON is malformed.
   */
  get stepSkillInvocations(): MJAIAgentRunStepEntity_AgentSkillInvocation[] {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return [];
    }
    const raw = this.selectedTimelineItem.data?.Skills;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Human-readable label for an invocation's activation type. */
  public GetActivationTypeLabel(inv: MJAIAgentRunStepEntity_AgentSkillInvocation): string {
    return inv.ActivationType === 'requested' ? 'User Requested' : 'Agent Self-Activated';
  }

  /**
   * Whether the scratchpad tab should be shown (step has scratchpad data in InputData or OutputData)
   */
  get showScratchpadTab(): boolean {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return false;
    }
    return this.stepScratchpadInput !== null || this.stepScratchpadOutput !== null;
  }

  /**
   * Parse scratchpad snapshot from InputData JSON
   */
  get stepScratchpadInput(): ScratchpadSnapshotView | null {
    return this.extractScratchpadFromField('InputData');
  }

  /**
   * Parse scratchpad snapshot from OutputData JSON
   */
  get stepScratchpadOutput(): ScratchpadSnapshotView | null {
    return this.extractScratchpadFromField('OutputData');
  }

  /**
   * Number of tasks that changed between input and output scratchpad snapshots
   */
  get scratchpadTaskChangeCount(): number {
    const input = this.stepScratchpadInput;
    const output = this.stepScratchpadOutput;
    if (!input && !output) return 0;
    if (!input || !output) return (output?.tasks?.length ?? 0) + (input?.tasks?.length ?? 0);

    let changes = 0;
    const inputMap = new Map(input.tasks.map(t => [t.id, t]));
    const outputMap = new Map(output.tasks.map(t => [t.id, t]));

    for (const [id, task] of outputMap) {
      const prev = inputMap.get(id);
      if (!prev || prev.status !== task.status || prev.title !== task.title || prev.notes !== task.notes) {
        changes++;
      }
    }
    for (const id of inputMap.keys()) {
      if (!outputMap.has(id)) changes++; // removed tasks
    }
    if (input.notes !== output.notes) changes++;
    return changes;
  }

  private extractScratchpadFromField(fieldName: 'InputData' | 'OutputData'): ScratchpadSnapshotView | null {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return null;
    }

    const stepData = this.selectedTimelineItem.data;
    const rawValue = stepData?.[fieldName];
    if (!rawValue) return null;

    try {
      let parsed = rawValue;
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      const scratchpad = parsed?.scratchpad;
      if (!scratchpad) return null;
      return {
        notes: scratchpad.notes ?? '',
        tasks: Array.isArray(scratchpad.tasks) ? scratchpad.tasks : []
      };
    } catch {
      return null;
    }
  }
}