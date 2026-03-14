/**
 * @fileoverview Agent Request Dialog Component
 *
 * A dialog wrapper for the AgentRequestPanelComponent that provides
 * a convenient way to view and respond to agent requests in a modal context.
 */

import {
    Component, Input, Output, EventEmitter, ChangeDetectorRef,
    ChangeDetectionStrategy, ViewChild, OnInit, OnChanges, SimpleChanges
} from '@angular/core';
import { MJAIAgentRequestEntity, MJAIAgentRequestTypeEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { AgentRequestPanelComponent, AgentRequestPanelResult } from '../panels/agent-request-panel/agent-request-panel.component';

@Component({
    standalone: false,
    selector: 'mj-agent-request-dialog',
    template: `
        @if (Visible) {
            @if (IsLoading) {
                <div class="loading-backdrop">
                    <mj-loading text="Loading request types..."></mj-loading>
                </div>
            } @else {
                <mj-agent-request-panel
                    #requestPanel
                    [Request]="Request"
                    [RequestTypes]="requestTypes"
                    [IsOpen]="Visible"
                    (Close)="OnPanelClose($event)">
                </mj-agent-request-panel>
            }
        }
    `,
    styles: [`
        .loading-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentRequestDialogComponent implements OnInit, OnChanges {
    @ViewChild('requestPanel') requestPanel!: AgentRequestPanelComponent;

    @Input() Visible = false;
    @Input() Request: MJAIAgentRequestEntity | null = null;

    @Output() Close = new EventEmitter<AgentRequestPanelResult>();

    public IsLoading = false;
    public requestTypes: MJAIAgentRequestTypeEntity[] = [];

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        if (this.Visible) {
            this.loadRequestTypes();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Visible'] && changes['Visible'].currentValue === true) {
            this.loadRequestTypes().then(() => {
                this.cdr.detectChanges();
                setTimeout(() => {
                    if (this.requestPanel && this.Request) {
                        this.requestPanel.Open(this.Request);
                    }
                }, 0);
            });
        }
    }

    private async loadRequestTypes(): Promise<void> {
        if (this.requestTypes.length > 0) return;

        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const result = await rv.RunView<MJAIAgentRequestTypeEntity>({
                EntityName: 'MJ: AI Agent Request Types',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.requestTypes = result.Results;
            }
        } catch (error) {
            console.error('Error loading request types:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    public OnPanelClose(result: AgentRequestPanelResult): void {
        this.Visible = false;
        this.Close.emit(result);
        this.cdr.markForCheck();
    }
}
