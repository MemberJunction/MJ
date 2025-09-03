import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, Output, ViewChildren, QueryList, SimpleChanges, ChangeDetectorRef, NgZone, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { CompositeKey, KeyValuePair, LogError, Metadata } from '@memberjunction/core';
import { SkipAPIAnalysisCompleteResponse} from '@memberjunction/skip-types';
import { ComponentStyles, ComponentCallbacks, ComponentUtilities, ComponentOption, BuildComponentCompleteCode, ComponentSpec } from '@memberjunction/interactive-component-types';
import { DrillDownInfo } from '../drill-down-info';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { MJReactComponent, StateChangeEvent, ReactComponentEvent, AngularAdapterService } from '@memberjunction/ng-react';
import { SetupStyles } from '@memberjunction/react-runtime';
import { SKIP_CHAT_ADDITIONAL_LIBRARIES } from '../skip-chat-library-config';
import { ToolbarConfig, ToolbarActionEvent, TOOLBAR_BUTTONS } from '@memberjunction/ng-code-editor';
import { EditorView } from '@codemirror/view';

@Component({
  selector: 'skip-dynamic-ui-component',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dynamic-ui-component.html',
  styleUrls: ['./dynamic-ui-component.css']
})
export class SkipDynamicUIComponentComponent implements AfterViewInit, OnDestroy {
    @Input() UIComponentCode: string | null = null;
    @Input() ComponentObjectName: string | null = null;
    @Input() ShowPrintReport: boolean = true;
    @Input() ShowReportOptionsToggle: boolean = true;
    @Input() ShowCreateReportButton: boolean = false;
    @Input() ShowOpenSavedReportButton: boolean = true;
    @Input() matchingReportID: string | null = null;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();
    @Output() CreateReportRequested = new EventEmitter<number>();
    @Output() NavigateToMatchingReportRequested = new EventEmitter<number>();

    @ViewChildren(MJReactComponent) reactComponents!: QueryList<MJReactComponent>;

    // Properties for handling multiple report options
    public componentOptions: ComponentOption[] = [];
    public selectedReportOptionIndex: number = 0;
    public currentError: { type: string; message: string; technicalDetails?: any } | null = null;
    
    // Cached component type name to avoid expression change errors
    private _cachedComponentTypeName: string = 'Component';
    public isCreatingReport: boolean = false;
    
    // Toggle states for showing/hiding component details
    public showFunctionalRequirements: boolean = false;
    public showDataRequirements: boolean = false;
    public showTechnicalDesign: boolean = false;
    public showCode: boolean = false;
    public showSpec: boolean = false;
    
    // Toolbar configuration for code editors
    public codeToolbarConfig: ToolbarConfig = {
        enabled: true,
        buttons: [TOOLBAR_BUTTONS.COPY]
    };
    
    // Details panel height for resizing
    public detailsPanelHeight: string = '300px';
    private isResizing: boolean = false;
    private startY: number = 0;
    private startHeight: number = 0;
    
    // Cache for user states only - component specs come from data
    public userStates = new Map<number, any>();
    // Note: utilities are now auto-initialized by mj-react-component if not provided
    public componentStyles: ComponentStyles | null = null;
    
    // Memoized flattened data context to prevent ExpressionChangedAfterItHasBeenCheckedError
    private _flattenedDataContext: Record<string, any> | null = null;
    private _lastDataContextHash: string | null = null;
    
    // Event handlers from React components

    private static librariesInitialized = false;

    constructor(
        private sanitizer: DomSanitizer,
        private cdr: ChangeDetectorRef,
        private ngZone: NgZone,
        private adapter: AngularAdapterService
    ) { }

    /**
     * Gets the currently selected report option
     */
    public get selectedReportOption(): ComponentOption | null {
        return this.componentOptions.length > this.selectedReportOptionIndex 
            ? this.componentOptions[this.selectedReportOptionIndex] 
            : null;
    }

    /**
     * Get tab title for a specific option index
     */
    public getTabTitle(index: number): string {
        const option = this.componentOptions[index];
        if (!option) 
            return `Report ${index + 1}`;

        if (option.AIRankExplanation && option.name)
            return option.name + " (" + option.AIRankExplanation + ")";

        if (option.name)
            return option.name;
        
        const componentType = option.option.type || 'Report';
        
        return `${componentType} ${index + 1}`;
    }
    
    /**
     * Check if this option is the AI's top recommendation
     */
    public isTopRanked(index: number): boolean {
        const option = this.componentOptions[index];
        return option?.AIRank === 1;
    }

    /**
     * Handles when the user selects a tab
     */
    public onTabSelect(event: any): void {
        const selectedIndex = event.index;
        this.onReportOptionChange(selectedIndex);
    }

    /**
     * Handles when the user changes the selected report option
     */
    public onReportOptionChange(selectedIndex: number): void {
        if (selectedIndex >= 0 && selectedIndex < this.componentOptions.length) {
            this.selectedReportOptionIndex = selectedIndex;
            this.updateCurrentReport();
        }
    }

    /**
     * Updates the current report display based on the selected option
     */
    private updateCurrentReport(): void {
        const selectedOption = this.selectedReportOption;
        if (!selectedOption) return;

        // Clear any previous error
        this.currentError = null;

        try {
            // Update the component info - this can fail if placeholders are missing
            this.UIComponentCode = BuildComponentCompleteCode(selectedOption.option);
            this.ComponentObjectName = selectedOption.option.name;
            
            // No need to cache component specs - they come from the data
            // Just trigger change detection to render the new component
            this.cdr.detectChanges();
        } catch (error) {
            console.error('Failed to build component code:', error);
            this.currentError = {
                type: 'Component Assembly Error',
                message: 'Failed to assemble the component code. This usually happens when sub-components are missing or placeholders cannot be resolved.',
                technicalDetails: error?.toString() || 'Unknown error during component assembly'
            };
            
            // Clear the UI component code to prevent partial rendering
            this.UIComponentCode = null;
            this.ComponentObjectName = null;
        }
    }
  
    public async PrintReport() {
        const currentComponent = this.getCurrentReactComponent();
        if (currentComponent) {
            // React component handles printing internally
            window.print();
        } else {
            window.print();
        }
    }

    /**
     * Handle toolbar actions from code editor
     */
    public handleCodeToolbarAction(event: ToolbarActionEvent): void {
        if (event.buttonId === 'copy' && event.editor) {
            // Get the editor content and copy to clipboard
            const content = event.editor.state.doc.toString();
            navigator.clipboard.writeText(content).then(() => {
                console.log('Code copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy to clipboard:', err);
            });
        }
    }
    
    /**
     * Copy error details to clipboard for user to send back to
     */
    public copyErrorToClipboard(): void {
        if (!this.currentError) return;
        
        const errorText = `Component Error:
Type: ${this.currentError.type}
Message: ${this.currentError.message}
${this.currentError.technicalDetails ? `\nTechnical Details:\n${this.currentError.technicalDetails}` : ''}

Component Option: ${this.selectedReportOptionIndex + 1}
Component Name: ${this.ComponentObjectName || 'Unknown'}`;

        navigator.clipboard.writeText(errorText).then(() => {
            alert('Error details copied to clipboard. You can paste this in the chat to get help.');
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
        });
    }

    /**
     * Get the React component for a specific option index
     */
    private getReactComponentForOption(optionIndex: number): MJReactComponent | null {
        if (!this.reactComponents || this.reactComponents.length === 0) {
            return null;
        }
        
        if (this.componentOptions.length === 1) {
            // Single option - use the only component
            return this.reactComponents.first || null;
        } else {
            // Multiple options - find by index
            return this.reactComponents.toArray()[optionIndex] || null;
        }
    }

    /**
     * Retry loading the current option
     */
    public retryCurrentOption(): void {
        // Clear the error
        this.currentError = null;
        
        // Just clear the error and re-render
        // Component spec comes from componentOptions data
        
        // Trigger change detection
        this.cdr.detectChanges();
    }

    /**
     * Handle create report request for a specific option
     */
    public createReportForOption(optionIndex: number): void {
        this.isCreatingReport = true;
        // Emit the event with the option index so the parent can handle it
        this.CreateReportRequested.emit(optionIndex);
    }
    
    public openReportForOption(optionIndex: number): void {
        this.NavigateToMatchingReportRequested.emit(optionIndex);
    }

    /**
     * Get the component type name for display
     */
    public getComponentTypeName(option: ComponentOption): string {
        const type = option.option.type || 'report';
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    /**
     * Get the cached component type name for the first option to avoid change detection errors
     */
    public get firstOptionComponentTypeName(): string {
        return this._cachedComponentTypeName;
    }
    
    /**
     * Toggle methods for showing/hiding component details
     */
    public toggleShowFunctionalRequirements(): void {
        this.showFunctionalRequirements = !this.showFunctionalRequirements;
        this.adjustDetailsPanelHeight();
    }
    
    public toggleShowDataRequirements(): void {
        this.showDataRequirements = !this.showDataRequirements;
        this.adjustDetailsPanelHeight();
    }
    
    public toggleShowTechnicalDesign(): void {
        this.showTechnicalDesign = !this.showTechnicalDesign;
        this.adjustDetailsPanelHeight();
    }
    
    public toggleShowCode(): void {
        this.showCode = !this.showCode;
        this.adjustDetailsPanelHeight();
    }

    public toggleShowSpec(): void {
        this.showSpec = !this.showSpec;
        this.adjustDetailsPanelHeight();
    }
    
    /**
     * Adjust the details panel height when toggling views
     */
    private adjustDetailsPanelHeight(): void {
        const anyVisible = this.showFunctionalRequirements || this.showDataRequirements || 
                          this.showTechnicalDesign || this.showCode || this.showSpec;
        
        if (anyVisible && this.detailsPanelHeight === '0px') {
            this.detailsPanelHeight = '300px';
        } else if (!anyVisible) {
            this.detailsPanelHeight = '0px';
        }
    }
    
    /**
     * Format functional requirements as HTML
     */
    public getFormattedFunctionalRequirements(option: ComponentOption): any {
        const requirements = option.option.functionalRequirements || 'No functional requirements specified.';
        const html = marked.parse(requirements);
        return this.sanitizer.sanitize(1, html); // 1 = SecurityContext.HTML
    }
    
    /**
     * Format data requirements as HTML
     */
    public getFormattedDataRequirements(option: ComponentOption): any {
        const dataReq = option.option.dataRequirements;
        if (!dataReq) {
            return this.sanitizer.sanitize(1, '<p>No data requirements specified.</p>');
        }
        
        let markdown = `## Data Access Mode: ${dataReq.mode}\n\n`;
        
        if (dataReq.description) {
            markdown += `${dataReq.description}\n\n`;
        }
               
        if (dataReq.entities && dataReq.entities.length > 0) {
            markdown += `### Entities\n\n`;
            dataReq.entities.forEach(entity => {
                markdown += `#### ${entity.name}\n- Description: ${entity.description || 'No description provided.'}\n `;
                if (entity.displayFields && entity.displayFields.length > 0) {
                  markdown += `- Display Fields:\n`;
                  entity.displayFields.forEach(field => {
                      markdown += `  - ${field}\n`;
                  });
                }
                if (entity.filterFields && entity.filterFields.length > 0) {
                    markdown += `- Filter Fields:\n`;
                    entity.filterFields.forEach(field => {
                        markdown += `  - ${field}\n`;
                    });
                }
                if (entity.sortFields && entity.sortFields.length > 0) {
                    markdown += `- Sort Fields:\n`;
                    entity.sortFields.forEach(field => {
                        markdown += `  - ${field}\n`;
                    });
                }
                if (entity.fieldMetadata && entity.fieldMetadata.length > 0) {
                    markdown += `- Field Metadata:\n`;
                    entity.fieldMetadata.forEach(meta => {
                        markdown += `  - ${meta.name}: ${meta.description || 'No description provided.'}\n`;
                    });
                } 

                if (entity.usageContext) {
                    markdown += `- Usage Context: ${entity.usageContext}\n`;
                }
                markdown += '\n';
            });
            markdown += '\n';
        }
        
        const html = marked.parse(markdown);
        return this.sanitizer.sanitize(1, html);
    }
    
    /**
     * Format technical design as HTML
     */
    public getFormattedTechnicalDesign(option: ComponentOption): any {
        const design = option.option.technicalDesign || 'No technical design specified.';
        const html = marked.parse(design);
        return this.sanitizer.sanitize(1, html);
    }
    
    /**
     * Get the component code
     */
    public getComponentCode(option: ComponentOption): string {
        try {
            return BuildComponentCompleteCode(option.option);
        } catch (e) {
            return `// Error building complete component code:\n// ${e}`;
        }
    }

    /**
     * Get the component spec
     */
    public getComponentSpec(option: ComponentOption): string {
        try {
            return JSON.stringify(option.option, null, 2);
        } catch (e) {
            return `// Error building complete component spec:\n// ${e}`;
        }
    }
    
    /**
     * Start resizing the details panel
     */
    public startResize(event: MouseEvent | TouchEvent): void {
        event.preventDefault();
        this.isResizing = true;
        this.startY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
        this.startHeight = parseInt(this.detailsPanelHeight, 10);
        
        // Use NgZone to run outside Angular to prevent change detection during drag
        this.ngZone.runOutsideAngular(() => {
            document.addEventListener('mousemove', this.onResize);
            document.addEventListener('mouseup', this.stopResize);
            document.addEventListener('touchmove', this.onResize);
            document.addEventListener('touchend', this.stopResize);
        });
    }
    
    /**
     * Handle resize movement
     */
    private onResize = (event: MouseEvent | TouchEvent): void => {
        if (!this.isResizing) return;
        
        const currentY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
        const deltaY = currentY - this.startY;
        const newHeight = Math.max(100, Math.min(600, this.startHeight + deltaY));
        
        // Run inside Angular to update the binding
        this.ngZone.run(() => {
            this.detailsPanelHeight = `${newHeight}px`;
            this.cdr.detectChanges();
        });
    }
    
    /**
     * Stop resizing
     */
    private stopResize = (): void => {
        this.isResizing = false;
        document.removeEventListener('mousemove', this.onResize);
        document.removeEventListener('mouseup', this.stopResize);
        document.removeEventListener('touchmove', this.onResize);
        document.removeEventListener('touchend', this.stopResize);
    }
    
    @HostListener('window:resize')
    onWindowResize(): void {
        // Ensure the details panel height remains valid on window resize
        const currentHeight = parseInt(this.detailsPanelHeight, 10);
        const maxHeight = window.innerHeight * 0.6;
        if (currentHeight > maxHeight) {
            this.detailsPanelHeight = `${maxHeight}px`;
        }
    }

    async ngAfterViewInit() {
        // Initialize libraries once per application if not already done
        if (!SkipDynamicUIComponentComponent.librariesInitialized) {
            try {
                await this.adapter.initialize(undefined, SKIP_CHAT_ADDITIONAL_LIBRARIES, {debug: true});
                SkipDynamicUIComponentComponent.librariesInitialized = true;
            } catch (error) {
                LogError('Failed to initialize Skip Chat libraries', error as any);
            }
        }
        
        if (this.SkipData) {
            this.setupReportOptions(this.SkipData);
        }
        
        // Initialize styles once using React runtime
        // Note: utilities are now auto-initialized by mj-react-component
        this.componentStyles = SetupStyles();
        
        // Initialize user states for all options
        // Use Promise.resolve to avoid ExpressionChangedAfterItHasBeenCheckedError
        if (this.componentOptions.length > 0) {
            Promise.resolve().then(() => {
                this.componentOptions.forEach((_, index) => {
                    if (!this.userStates.has(index)) {
                        this.userStates.set(index, {});
                    }
                });
                this.cdr.detectChanges();
            });
        }
    }
    
    ngOnDestroy(): void {
        // Clean up user states
        this.userStates.clear();
        
        // Ensure resize listeners are removed if still active
        if (this.isResizing) {
            this.stopResize();
        }
        
        // The MJReactComponent handles its own cleanup
    }
    
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['SkipData']) {
            // Clear cached data context when SkipData changes
            this._flattenedDataContext = null;
            this._lastDataContextHash = null;
            
            const skipData = changes['SkipData'].currentValue;
            if (skipData) {
                this.setupReportOptions(skipData);
            }
        }
    }

    /**
     * Get the currently active React component
     */
    private getCurrentReactComponent(): MJReactComponent | null {
        return this.getReactComponentForOption(this.selectedReportOptionIndex);
    }
  
    private _skipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() get SkipData(): SkipAPIAnalysisCompleteResponse | undefined {
        return this._skipData ? this._skipData : undefined;   
    }
    set SkipData(d: SkipAPIAnalysisCompleteResponse | undefined){
        const hadData = this._skipData ? true : false;
        this._skipData = d;
        if (d) {
            // For backward compatibility, check if we have component options
            if (d.componentOptions && d.componentOptions.length > 0) {
                // Use the first component option (or the highest ranked one)
                const component = d.componentOptions[0];
                this.UIComponentCode = BuildComponentCompleteCode(component.option);
                this.ComponentObjectName = component.option.name;
            } else {
                // Fallback for old format
                this.UIComponentCode = (d as any).htmlReport;
                this.ComponentObjectName = (d as any).htmlReportObjectName;
            }
        }
        if (d && hadData) {
            // Update the current display with new data
            this.updateCurrentReport();
        }
    }

    /**
     * Sets up the component options from the SkipData, prioritizing the new componentOptions array
     * but falling back to the deprecated htmlReport/htmlReportObjectName for backward compatibility
     */
    private setupReportOptions(data: SkipAPIAnalysisCompleteResponse): void {
        // Check if we have the new componentOptions array
        if (data.componentOptions && data.componentOptions.length > 0) {
            // Sort by AIRank (lower numbers = better ranking)
            this.componentOptions = [...data.componentOptions].sort((a, b) => {
                const rankA = a.AIRank ?? Number.MAX_SAFE_INTEGER;
                const rankB = b.AIRank ?? Number.MAX_SAFE_INTEGER;
                return rankA - rankB;
            });
            
            // Select the best option (first in sorted array)
            this.selectedReportOptionIndex = 0;
            const bestOption = this.componentOptions[0];
            this.UIComponentCode = BuildComponentCompleteCode(bestOption.option);
            this.ComponentObjectName = bestOption.option.name;
            
            // Update cached component type name after current change detection cycle
            Promise.resolve().then(() => {
                this._cachedComponentTypeName = this.getComponentTypeName(bestOption);
                this.cdr.detectChanges();
            });
        } 
    }


    /**
     * Initialize user state for a specific option index
     */
    private initializeUserStateForOption(optionIndex: number): void {
        // Initialize user state if not exists
        if (!this.userStates.has(optionIndex)) {
            this.userStates.set(optionIndex, {});
        }
    }
    
    /**
     * Handle state change events from React components
     */
    public onStateChange(optionIndex: number, event: StateChangeEvent): void {
        const currentState = this.userStates.get(optionIndex) || {};
        this.userStates.set(optionIndex, {
            ...currentState,
            [event.path]: event.value
        });
        
        // Handle any additional state change logic
        this.handleUpdateUserState({ [event.path]: event.value });
    }
    
    /**
     * Handle component events from React components
     */
    public onComponentEvent(optionIndex: number, event: ReactComponentEvent): void {
        if (event.type === 'error') {
            this.currentError = {
                type: event.payload.source || 'React Component Error',
                message: event.payload.error || 'An unknown error occurred',
                technicalDetails: event.payload.errorInfo
            };
        } else {
            this.handleNotifyEvent(event.type, event.payload);
        }
    }
    
    /**
     * Handle open entity record events
     */
    public onOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
        this.handleOpenEntityRecord(event.entityName, event.key);
    }

    
    public getFlattenedDataContext(): Record<string, any> {
        // Create a simple hash of the data context to detect changes
        let currentHash = '';
        if (this.SkipData?.dataContext) {
            const loadedItems = this.SkipData.dataContext.Items.filter((i: any) => i.DataLoaded && i._Data?.length > 0);
            currentHash = loadedItems.map((item: any) => `${item.ID}_${item._Data?.length || 0}`).join('_');
        }
        
        // Check if we need to recalculate (data changed)
        if (this._flattenedDataContext && this._lastDataContextHash === currentHash) {
            return this._flattenedDataContext;
        }
        
        // Recalculate and cache
        const flattenedDataContext: Record<string, any> = {};
        
        if (this.SkipData?.dataContext) {
            const loadedItems = this.SkipData.dataContext.Items.filter((i: any) => i.DataLoaded && i._Data?.length > 0);
            for (let i = 0; i < loadedItems.length; i++) {
                flattenedDataContext["data_item_" + i] = loadedItems[i]._Data;
            }
        }
        
        this._flattenedDataContext = flattenedDataContext;
        this._lastDataContextHash = currentHash;
        
        return this._flattenedDataContext;
    }

    // Event handler implementations
    public handleRefreshData(): void {
        console.log('Component requested data refresh');
        // Emit an event or call parent component method to refresh data
    }
    
    private handleOpenEntityRecord(entityName: string, key: CompositeKey): void {
        if (entityName) {
            // bubble this up to our parent component as we don't directly open records in this component
            const md = new Metadata();
            const entityMatch = md.EntityByName(entityName);
            if (!entityMatch) {
                // couldn't find it, but sometimes the AI uses a table name or a view name, let's check for that
                const altMatch = md.Entities.filter(e => e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                        e.BaseView.toLowerCase() === entityName.toLowerCase() || 
                                                        e.SchemaName.toLowerCase() + '.' + e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                        e.SchemaName.toLowerCase() + '.' + e.BaseView.toLowerCase() === entityName.toLowerCase());
                if (altMatch && altMatch.length === 1) { 
                    entityName = altMatch[0].Name;
                }
            }
            // check what we were passed, it might be a real CompositeKey or a KeyValuePair[]
            if (!(key instanceof CompositeKey)) {
                // convert KeyValuePair[] to CompositeKey
                key = new CompositeKey(key as KeyValuePair[]);
            }
            // Emit the drill down event with the entity name and where clause
            this.DrillDownEvent.emit(new DrillDownInfo(entityName, key.ToWhereClause()));
        }
    }
    
    private handleUpdateUserState(userState: any): void {
        console.log('Component updated user state:', userState);
        // TODO: Implement user state persistence if needed
    }
    
    private handleNotifyEvent(eventName: string, eventData: any): void {
        console.log(`Component raised event: ${eventName} notified with data:`, eventData);
        
        // Handle component errors from React host
        if (eventName === 'componentError') {
            this.currentError = {
                type: eventData.source || 'React Component Error',
                message: eventData.error || 'An unknown error occurred in the React component',
                technicalDetails: eventData.stackTrace || eventData.errorInfo?.componentStack || eventData.errorInfo || null
            };
        }
        // TODO: Handle other custom events as needed
    }
 

    public async refreshReport(data?: any): Promise<void> {
        const currentComponent = this.getCurrentReactComponent();
        if (currentComponent) {
            currentComponent.refresh();
        }
    }

    /**
     * Format technical details for display, handling both strings and objects
     */
    public formatTechnicalDetails(details: any): string {
        if (!details) {
            return 'No technical details available';
        }
        
        if (typeof details === 'string') {
            return details;
        }
        
        // If it's an object, pretty-print it as JSON
        try {
            return JSON.stringify(details, null, 2);
        } catch (e) {
            // Fallback for circular references or other JSON issues
            return String(details);
        }
    }
}
