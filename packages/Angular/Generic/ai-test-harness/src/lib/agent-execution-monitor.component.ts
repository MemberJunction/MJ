import { Component, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AIAgentRunEntityExtended, AIAgentRunStepEntityExtended } from '@memberjunction/core-entities';

/**
 * Simplified execution monitor that displays agent run steps in a timeline
 */
@Component({
    selector: 'mj-agent-execution-monitor',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="execution-monitor">
            <div class="monitor-header">
                <h3>Execution Timeline</h3>
                @if (agentRun) {
                    <div class="stats">
                        <span>Steps: {{ getSteps().length }}</span>
                        <span>Status: {{ agentRun.Status }}</span>
                        @if (agentRun.TotalTokensUsed) {
                            <span>Tokens: {{ agentRun.TotalTokensUsed }}</span>
                        }
                    </div>
                }
            </div>
            
            <div class="timeline">
                @if (!agentRun || (!getSteps().length)) {
                    <div class="empty-state">No execution data available</div>
                } @else {
                    @for (step of getSteps(); track step.ID) {
                        <div class="timeline-item" [class.failed]="!step.Success">
                            <div class="step-header">
                                <span class="step-number">#{{ step.StepNumber }}</span>
                                <span class="step-type">{{ step.StepType }}</span>
                                <span class="step-name">{{ step.StepName }}</span>
                            </div>
                            
                            @if (step.ErrorMessage) {
                                <div class="error-message">{{ step.ErrorMessage }}</div>
                            }
                            
                            <div class="step-meta">
                                <span>{{ formatDate(step.StartedAt) }}</span>
                                @if (step.CompletedAt) {
                                    <span>Duration: {{ calculateDuration(step.StartedAt, step.CompletedAt) }}</span>
                                }
                            </div>
                        </div>
                    }
                }
            </div>
        </div>
    `,
    styles: [`
        .execution-monitor {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: var(--surface-a);
        }
        
        .monitor-header {
            padding: 1rem;
            border-bottom: 1px solid var(--surface-border);
        }
        
        .monitor-header h3 {
            margin: 0 0 0.5rem 0;
        }
        
        .stats {
            display: flex;
            gap: 1rem;
            font-size: 0.875rem;
            color: var(--text-color-secondary);
        }
        
        .timeline {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
        }
        
        .empty-state {
            text-align: center;
            color: var(--text-color-secondary);
            padding: 2rem;
        }
        
        .timeline-item {
            background: var(--surface-ground);
            border: 1px solid var(--surface-border);
            border-radius: 4px;
            padding: 1rem;
            margin-bottom: 0.5rem;
        }
        
        .timeline-item.failed {
            border-color: var(--red-500);
            background: var(--red-50);
        }
        
        .step-header {
            display: flex;
            gap: 1rem;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        
        .step-number {
            font-weight: bold;
            color: var(--primary-color);
        }
        
        .step-type {
            background: var(--primary-color);
            color: white;
            padding: 0.125rem 0.5rem;
            border-radius: 3px;
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        
        .step-name {
            flex: 1;
        }
        
        .error-message {
            color: var(--red-700);
            font-size: 0.875rem;
            margin: 0.5rem 0;
            padding: 0.5rem;
            background: var(--red-100);
            border-radius: 3px;
        }
        
        .step-meta {
            font-size: 0.75rem;
            color: var(--text-color-secondary);
            display: flex;
            gap: 1rem;
        }
    `]
})
export class AgentExecutionMonitorComponent implements OnChanges {
    @Input() agentRun: AIAgentRunEntityExtended | null = null;
    @Input() mode: 'live' | 'historical' = 'historical';
    @Input() autoExpand: boolean = true;
    @Input() liveSteps: AIAgentRunStepEntityExtended[] = [];
    @Input() runId: string | null = null;
    @Input() runType: 'agent' | 'prompt' = 'agent';
    
    constructor(private cdr: ChangeDetectorRef) {}
    
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['agentRun']) {
            console.log('Agent run updated:', {
                id: this.agentRun?.ID,
                stepCount: this.agentRun?.Steps?.length || 0
            });
        }
        
        if (changes['liveSteps']) {
            console.log('Live steps updated:', {
                count: this.liveSteps?.length || 0,
                mode: this.mode
            });
            // Force change detection when live steps update
            this.cdr.detectChanges();
        }
    }
    
    getSteps(): AIAgentRunStepEntityExtended[] {
        // Always use the agent run's Steps - they're updated during streaming
        return this.agentRun?.Steps || [];
    }
    
    formatDate(date: Date | string | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString();
    }
    
    calculateDuration(start: Date | string, end: Date | string | null): string {
        if (!end) return 'Running...';
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const duration = endTime - startTime;
        
        if (duration < 1000) return `${duration}ms`;
        if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
        return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
    }
}