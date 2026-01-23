import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, Injector } from '@angular/core';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { RunView, CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { SharedService } from '@memberjunction/ng-shared';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';

@Component({
    selector: 'mj-flow-agent-form-section',
    templateUrl: './flow-agent-form-section.component.html',
    styleUrls: ['./flow-agent-form-section.component.css']
})
@RegisterClass(BaseFormSectionComponent, 'AI Agents.FlowAgentSection')
export class FlowAgentFormSectionComponent extends BaseFormSectionComponent implements OnInit, OnDestroy {
    @ViewChild('reteContainer', { static: true }) reteContainer!: ElementRef<HTMLDivElement>;
    
    private destroy$ = new Subject<void>();
    
    steps: AIAgentStepEntity[] = [];
    paths: AIAgentStepPathEntity[] = [];
    loading = true;
    error: string | null = null;
    activeTab: 'diagram' | 'data' = 'diagram';
    selectedStepId: string | null = null;
    
    get agentId(): string | null {
        return this.record && 'ID' in this.record ? (this.record as AIAgentEntityExtended).ID : null;
    }

    private sharedService: SharedService;
    
    constructor(private cdr: ChangeDetectorRef, private injector: Injector) {
        super();
        this.sharedService = this.injector.get(SharedService);
    }

    async ngOnInit() {
        await this.loadFlowData();
        if (this.steps.length > 0 || this.EditMode) {
            await this.initializeFlowVisualization();
        }
        this.loading = false;
        this.cdr.detectChanges();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private async loadFlowData(): Promise<void> {
        if (!this.record || !('ID' in this.record)) {
            return;
        }

        try {
            const rv = new RunView();
            // First load steps
            const stepsResult = await rv.RunView<AIAgentStepEntity>({
                EntityName: 'MJ: AI Agent Steps',
                ExtraFilter: `AgentID='${(this.record as AIAgentEntityExtended).ID}'`,
                OrderBy: 'StartingStep DESC, Name',
                ResultType: 'entity_object'
            });

            if (stepsResult.Success) {
                this.steps = stepsResult.Results || [];
                
                // If we have steps, load paths for those steps
                if (this.steps.length > 0) {
                    const stepIds = this.steps.map(s => `'${s.ID}'`).join(',');
                    const pathsResult = await rv.RunView<AIAgentStepPathEntity>({
                        EntityName: 'MJ: AI Agent Step Paths',
                        ExtraFilter: `OriginStepID IN (${stepIds})`,
                        OrderBy: 'Priority DESC',
                        ResultType: 'entity_object'
                    });

                    if (pathsResult.Success) {
                        this.paths = pathsResult.Results || [];
                    } else {
                        this.error = `Failed to load agent paths: ${pathsResult.ErrorMessage}`;
                    }
                }
            } else {
                this.error = `Failed to load agent steps: ${stepsResult.ErrorMessage}`;
            }
        } catch (error) {
            this.error = `Error loading flow data: ${error}`;
        }
    }

    private async initializeFlowVisualization(): Promise<void> {
        // Flow visualization is now handled by the flow-agent-diagram component
    }

    private async addNewStep(): Promise<void> {
        // This would open a dialog or form to create a new step
        // Implementation handled by flow-agent-diagram component
    }

    public async refreshFlow(): Promise<void> {
        this.loading = true;
        this.cdr.detectChanges();
        
        // Reload data and reinitialize
        await this.loadFlowData();
        if (this.steps.length > 0 || this.EditMode) {
            await this.initializeFlowVisualization();
        }
        
        this.loading = false;
        this.cdr.detectChanges();
    }
    
    public getStepName(stepId: string): string {
        const step = this.steps.find(s => s.ID === stepId);
        return step?.Name || 'Unknown Step';
    }
    
    public selectStep(stepId: string): void {
        this.selectedStepId = this.selectedStepId === stepId ? null : stepId;
        this.cdr.detectChanges();
    }
    
    public get filteredPaths(): AIAgentStepPathEntity[] {
        if (!this.selectedStepId) {
            return this.paths;
        }
        
        // Show paths where the selected step is either the origin or destination
        return this.paths.filter(p => 
            p.OriginStepID === this.selectedStepId || 
            p.DestinationStepID === this.selectedStepId
        );
    }
    
    public async openEntityRecord(entityName: string, recordId: string): Promise<void> {
        if (this.sharedService) {
            await this.sharedService.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
        }
    }
}