import { Component, Input } from '@angular/core';
import { AIAgentStepEntity } from '@memberjunction/core-entities';

@Component({
  standalone: false,
    selector: 'mj-step-info-control',
    template: `
        <div class="step-info-control">
            <div class="step-type">
                <i class="fa-solid" [ngClass]="getStepIcon()"></i>
                {{ step.StepType || 'Unknown Type' }}
            </div>
            @if (step.SubAgentID && step.SubAgent) {
                <div class="sub-agent">
                    <i class="fa-solid fa-robot"></i>
                    {{ step.SubAgent }}
                </div>
            }
            @if (step.StartingStep) {
                <div class="step-order">
                    <i class="fa-solid fa-flag"></i>
                    Starting Step
                </div>
            }
        </div>
    `,
    styles: [`
        .step-info-control {
            padding: 8px;
            font-size: 0.875rem;
        }
        
        .step-type,
        .sub-agent,
        .step-order {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.25rem;
        }
        
        .step-type {
            font-weight: 500;
            color: #333;
        }
        
        .sub-agent {
            color: #4a90e2;
        }
        
        .step-order {
            color: #666;
            font-size: 0.75rem;
        }
        
        i {
            width: 16px;
            text-align: center;
        }
    `]
})
export class StepInfoControlComponent {
    @Input() step!: AIAgentStepEntity;
    
    getStepIcon(): string {
        switch (this.step.StepType?.toLowerCase()) {
            case 'action':
                return 'fa-bolt';
            case 'sub-agent':
                return 'fa-robot';
            case 'prompt':
                return 'fa-brain';
            case 'condition':
                return 'fa-code-branch';
            case 'loop':
                return 'fa-repeat';
            case 'parallel':
                return 'fa-random';
            default:
                return 'fa-cube';
        }
    }
}