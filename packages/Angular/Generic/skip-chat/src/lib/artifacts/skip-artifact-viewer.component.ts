import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild, ViewContainerRef, ComponentRef, AfterViewInit, ComponentFactoryResolver, Injector, Output, EventEmitter, ChangeDetectorRef, OnDestroy, ElementRef } from '@angular/core';
import { ConversationArtifactEntity, ArtifactTypeEntity, ConversationArtifactVersionEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { RunView, LogError, LogStatus } from '@memberjunction/core';
import { DataContext } from '@memberjunction/data-context';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { SkipDynamicReportWrapperComponent } from '../dynamic-report/skip-dynamic-report-wrapper';
import { SkipAPIResponse, SkipAPIAnalysisCompleteResponse, SkipResponsePhase } from '@memberjunction/skip-types';
import { DrillDownInfo } from '../drill-down-info';
import { ComponentNode, ComponentFeedback } from './skip-component-feedback-panel.component';
import { GraphQLComponentRegistryClient } from '@memberjunction/graphql-dataprovider';

@Component({
  selector: 'skip-artifact-viewer',
  templateUrl: './skip-artifact-viewer.component.html',
  styleUrls: ['./skip-artifact-viewer.component.css']
})
export class SkipArtifactViewerComponent extends BaseAngularComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() public ArtifactID: string = '';
  @Input() public ArtifactVersionID: string = '';
  @Input() public DataContext: DataContext | null = null;
  
  @ViewChild('reportContainer', { read: ViewContainerRef, static: false }) reportContainer!: ViewContainerRef;
  @ViewChild('reportContainer', { read: ElementRef, static: false }) reportContainerElement!: ElementRef;

  /**
   * Event emitted when the user clicks on a matching report and the application needs to handle the navigation
   */
  @Output() NavigateToMatchingReport = new EventEmitter<string>();

  /**
   * This event fires whenever a new report is created.
   */
  @Output() NewReportCreated = new EventEmitter<string>();

  /**
   * This event fires whenever a drill down is requested within a given report.
   */
  @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();
  
  /**
   * Event that emits the artifact info for display in parent components
   */
  @Output() ArtifactInfoChanged = new EventEmitter<{
    title: string;
    type: string;
    date: Date | null;
    version: string;
    versionList?: Array<{ID: string, Version: string | number, __mj_CreatedAt: Date}>;
    selectedVersionId?: string;
  }>();
  
  public isLoading: boolean = false;
  public artifact: ConversationArtifactEntity | null = null;
  public artifactVersion: ConversationArtifactVersionEntity | null = null;
  public artifactType: any = null;
  public contentType: string = '';
  public displayContent: any = null;
  public error: string | null = null;
  public artifactVersions: ConversationArtifactVersionEntity[] = [];
  public selectedVersionId: string = '';
  public showVersionDropdown: boolean = false;
  private reportComponentRef: ComponentRef<any> | null = null;
  public conversationDetailRecord: ConversationDetailEntity | null = null;

  // Component feedback properties
  public showFeedbackPanel = false;
  public componentHierarchy: ComponentNode | null = null;
  public selectedFeedbackComponent: ComponentNode | null = null;

  constructor(
    private notificationService: MJNotificationService,
    private componentFactoryResolver: ComponentFactoryResolver,
    private cdRef: ChangeDetectorRef,
    private injector: Injector) {
    super();
  }

  ngOnInit(): void {
    if (this.ArtifactID) {
      this.loadArtifact();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['ArtifactID'] && !changes['ArtifactID'].firstChange) || 
        (changes['ArtifactVersionID'] && !changes['ArtifactVersionID'].firstChange)) {
      this.loadArtifact();
    }
  }

  ngAfterViewInit(): void {
    // If the artifact is already loaded (happens when component is created with initial inputs),
    // we need to create the report component once the view is initialized
    if (this.artifact && this.artifactVersion) {
      // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
      // and to ensure reportContainer is properly initialized
      setTimeout(async () => {
        if (this.reportContainer) {
          await this.createReportComponent();
        } else {
          // If the container is still not available, try once more after a longer delay
          setTimeout(async () => {
            if (this.reportContainer) {
              await this.createReportComponent();
            } else {
              LogError('Report container still not available after multiple attempts');
            }
          }, 100);
        }
      }, 0);
    }
  }

  private async loadArtifact(): Promise<void> {
    if (!this.ArtifactID) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const provider = this.ProviderToUse;
      
      // Load the artifact
      const artifactEntity = await provider.GetEntityObject<ConversationArtifactEntity>('MJ: Conversation Artifacts', provider.CurrentUser);
      if (!await artifactEntity.Load(this.ArtifactID)) {
        throw new Error(`Failed to load artifact: ${artifactEntity.LatestResult.CompleteMessage}`);
      }

      this.artifact = artifactEntity;
      
      // Load the artifact type
      const artifactTypeEntity = await provider.GetEntityObject<ArtifactTypeEntity>('MJ: Artifact Types', provider.CurrentUser);
      if (!await artifactTypeEntity.Load(this.artifact.ArtifactTypeID)) {
        throw new Error(`Failed to load artifact type: ${artifactTypeEntity.LatestResult.CompleteMessage}`);
      }

      this.artifactType = artifactTypeEntity;
      this.contentType = this.artifactType.ContentType;

      // Load all versions of this artifact for the dropdown
      await this.loadArtifactVersions();

      // Load the specific artifact version if provided, otherwise use the latest version
      if (this.ArtifactVersionID) {
        this.loadSpecificArtifactVersion(this.ArtifactVersionID);
      } else if (this.artifactVersions.length > 0) {
        // Use the latest version (first in the list since we sort by Version DESC)
        this.artifactVersion = this.artifactVersions[0];
        this.selectedVersionId = this.artifactVersion.ID;
      } else {
        throw new Error('No artifact versions found');
      }
      
      // Emit artifact info for parent components
      this.emitArtifactInfo();
      
      // Create the report component after a short delay to ensure Angular has time to initialize the view
      this.isLoading = false;
      this.cdRef.detectChanges(); // Trigger change detection to update the view
      setTimeout(() => {
        // Check again if view is initialized
        if (this.reportContainer) {
          this.createReportComponent();
        } else {
          // If still not initialized, we'll try again in ngAfterViewInit
          LogError('Report container not yet initialized, will try in ngAfterViewInit');
        }
      }, 0);
    } catch (err) {
      LogError('Error loading artifact', err instanceof Error ? err.message : String(err));
      this.error = err instanceof Error ? err.message : 'Unknown error loading artifact';
      this.notificationService.CreateSimpleNotification(
        'Error loading artifact', 
        'error',
        3000
      );
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Loads all versions of the current artifact for the dropdown
   */
  private async loadArtifactVersions(): Promise<void> {
    const runView = new RunView(this.RunViewToUse);
    const versionResult = await runView.RunView<ConversationArtifactVersionEntity>({
      EntityName: 'MJ: Conversation Artifact Versions',
      ResultType: 'entity_object',
      OrderBy: 'Version DESC',
      ExtraFilter: `ConversationArtifactID = '${this.ArtifactID}'`
    });

    if (versionResult && versionResult.Success && versionResult.Results.length > 0) {
      this.artifactVersions = versionResult.Results;
    } else {
      this.artifactVersions = [];
    }
  }

  /**
   * Loads a specific artifact version by ID
   */
  private loadSpecificArtifactVersion(versionId: string) {
    // grab the version from the this.artifactVersions array
    const version = this.artifactVersions.find((v) => v.ID === versionId);
    if (!version) {
      throw new Error(`Artifact version with ID ${versionId} not found`);
    }
    this.artifactVersion = version;
    this.selectedVersionId = this.artifactVersion.ID;
  }

  /**
   * Called when the user selects a different version from the dropdown
   */
  public async onVersionChange(): Promise<void> {
    if (this.selectedVersionId) {
      this.isLoading = true;
      try {
        // Destroy existing component if any
        this.destroyReportComponent();

        // Load the selected version
        this.loadSpecificArtifactVersion(this.selectedVersionId);
        
        // Emit updated artifact info
        this.emitArtifactInfo();

        this.isLoading = false;
        this.cdRef.detectChanges(); // Trigger change detection to update the view

        // Wait for the next Angular cycle and ensure reportContainer is available
        setTimeout(async () => {
          if (this.reportContainer) {
            await this.createReportComponent();
          } else {
            // If the container is still not available, try once more after a longer delay
            setTimeout(async () => {
              if (this.reportContainer) {
                await this.createReportComponent();
              } else {
                LogError('Report container not available when changing versions');
              }
            }, 100);
          }
        }, 0);
      } catch (err) {
        LogError('Error changing artifact version', err instanceof Error ? err.message : String(err));
        this.error = err instanceof Error ? err.message : 'Unknown error loading artifact version';
        this.notificationService.CreateSimpleNotification(
          'Error loading artifact version', 
          'error',
          3000
        );
        this.isLoading = false;
      }
    }
  }

  /**
   * Creates the report component using the current artifact version Configuration
   */
  private async createReportComponent(): Promise<void> {
    if (!this.reportContainer || !this.artifactVersion) {
      return;
    }

    // Clear any existing component
    this.destroyReportComponent();
    this.reportContainer.clear();

    try {
      // Load conversation detail record to get AI message
      await this.loadConversationDetail();

      // Create the report component based on Configuration
      const componentFactory = this.componentFactoryResolver.resolveComponentFactory(SkipDynamicReportWrapperComponent);
      this.reportComponentRef = this.reportContainer.createComponent(componentFactory);

      if (this.reportComponentRef) {
        const instance = this.reportComponentRef.instance as SkipDynamicReportWrapperComponent
        
        // Initialize from AI message or Configuration
        let configData = null;
        
        try {
          if (typeof this.artifactVersion.Configuration === 'string') {
            configData = JSON.parse(this.artifactVersion.Configuration);
          } else {
            // If it's already an object, use it directly
            configData = this.artifactVersion.Configuration;
          }
        } catch (parseErr) {
          LogError('Error parsing artifact configuration', parseErr instanceof Error ? parseErr.message : String(parseErr));
          configData = null;
        }

        // If we couldn't get data from Artifact Version, try to get it from AI message
        if (!configData && 
            this.conversationDetailRecord && 
            this.conversationDetailRecord.Role.trim().toLowerCase() === 'ai' &&
            this.conversationDetailRecord.ID?.length > 0) {
          try {
            const resultObject = <SkipAPIResponse>JSON.parse(this.conversationDetailRecord.Message);
            
            if (resultObject.success && resultObject.responsePhase === SkipResponsePhase.analysis_complete) {
              // Use the Skip API response data directly
              configData = <SkipAPIAnalysisCompleteResponse>resultObject;
            }
          } catch (parseErr) {
            LogError('Error parsing AI message', parseErr instanceof Error ? parseErr.message : String(parseErr));
          }
        }
        
        if (!configData) {
          throw new Error('No valid configuration data found');
        }

        // Set properties on the report component
        instance.SkipData = configData;
        instance.Provider = this.ProviderToUse;
        instance.ShowOpenReportButton = false; // we don't want this feature because artifacts show this button within, but in linear report format when shown IN a conversation this button is okay by default just not here

        // Set up event handlers
        instance.NavigateToMatchingReport.subscribe((reportID: string) => {
          this.NavigateToMatchingReport.emit(reportID); // bubble up
        });
        
        instance.NewReportCreated.subscribe((reportID: string) => {
          this.NewReportCreated.emit(reportID); // bubble up
        });
        
        instance.DrillDownEvent.subscribe((drillDownInfo: any) => {
          this.DrillDownEvent.emit(drillDownInfo); // bubble up
        });

        // Set additional properties
        if (this.DataContext) {
          instance.DataContext = this.DataContext;
        }
        
        instance.AllowDrillDown = false; // Disable drill-down in artifact viewer for simplicity
        
        // Set conversation info if available
        if (this.conversationDetailRecord) {
          instance.ConversationID = this.conversationDetailRecord.ConversationID;
          instance.ConversationDetailID = this.conversationDetailRecord.ID;
          instance.ConversationName = this.conversationDetailRecord.Conversation;
        }

        // Pass feedback state and handler to wrapper
        instance.showFeedbackPanel = this.showFeedbackPanel;
        instance.toggleFeedbackPanel = () => this.toggleFeedbackPanel();
      }
    } catch (err) {
      LogError('Error creating report component', err instanceof Error ? err.message : String(err));
      this.error = 'Failed to create artifact viewer component: ' + (err instanceof Error ? err.message : String(err));
    }
  }
  
  /**
   * Loads the conversation detail record associated with this artifact
   */
  private async loadConversationDetail(): Promise<void> {
    if (!this.artifact || !this.artifact.ID) {
      return;
    }
    
    try {
      // Get the conversation detail record
      const runView = new RunView(this.RunViewToUse);
      const detailsResult = await runView.RunView<ConversationDetailEntity>({
        EntityName: 'Conversation Details',
        ResultType: 'entity_object',
        ExtraFilter: `ArtifactID = '${this.artifact.ID}' ${this.artifactVersion ? `AND ArtifactVersionID = '${this.artifactVersion.ID}'` : ''}`,
        OrderBy: '__mj_CreatedAt DESC' // Get most recent first
      });
      
      if (detailsResult && detailsResult.Success && detailsResult.Results.length > 0) {
        this.conversationDetailRecord = detailsResult.Results[0];
      }
    } catch (err) {
      LogError('Error loading conversation detail for artifact', err instanceof Error ? err.message : String(err));
      // Don't set an error here, as this is non-critical - we can still try to use Configuration
    }
  }

  /**
   * Destroys the current report component if it exists
   */
  private destroyReportComponent(): void {
    if (this.reportComponentRef) {
      this.reportComponentRef.destroy();
      this.reportComponentRef = null;
    }
  }

  public get artifactTitle(): string {
    return this.artifact ? this.artifact.Name : 'Loading...';
  }

  public get artifactTypeName(): string {
    return this.artifactType ? this.artifactType.Name : '';
  }

  public get isJson(): boolean {
    return this.contentType.includes('json');
  }

  public get isMarkdown(): boolean {
    return this.contentType.includes('markdown');
  }

  public get isCode(): boolean {
    return this.contentType.includes('javascript') || 
           this.contentType.includes('python') || 
           this.contentType.includes('java') || 
           this.contentType.includes('csharp') || 
           this.contentType.includes('sql') ||
           this.contentType.includes('typescript');
  }

  public get isHtml(): boolean {
    return this.contentType.includes('html');
  }

  /**
   * Toggles the version dropdown menu
   */
  public toggleVersionDropdown(): void {
    this.showVersionDropdown = !this.showVersionDropdown;
  }

  /**
   * Selects a version and closes the dropdown
   */
  public selectVersion(versionId: string): void {
    this.selectedVersionId = versionId;
    this.showVersionDropdown = false;
    this.onVersionChange();
  }

  /**
   * Gets the current version number for display
   */
  public getCurrentVersionNumber(): string {
    if (!this.artifactVersion) return '1';
    return String(this.artifactVersion.Version || '1');
  }

  /**
   * Emits the current artifact info to parent components
   */
  private emitArtifactInfo(): void {
    if (this.artifact) {
      this.ArtifactInfoChanged.emit({
        title: this.artifactTitle,
        type: this.artifactTypeName,
        date: this.artifactVersion?.__mj_CreatedAt || null,
        version: this.getCurrentVersionNumber(),
        versionList: this.artifactVersions.map(v => ({
          ID: v.ID,
          Version: v.Version,
          __mj_CreatedAt: v.__mj_CreatedAt
        })),
        selectedVersionId: this.artifactVersion?.ID || ''
      });
    }
  }

  public get isPlainText(): boolean {
    return this.contentType.includes('text/plain');
  }

  /**
   * Toggle the component feedback panel
   */
  public toggleFeedbackPanel(): void {
    this.showFeedbackPanel = !this.showFeedbackPanel;

    if (this.showFeedbackPanel) {
      // Load component hierarchy from artifact configuration
      this.loadComponentHierarchy();
    } else {
      this.selectedFeedbackComponent = null;
    }
  }

  /**
   * Load component hierarchy from the React component's resolved spec
   * The React Runtime has the full component hierarchy with all dependencies resolved
   */
  private loadComponentHierarchy(): void {
    try {
      if (!this.reportComponentRef) {
        LogError('No report component reference available for loading hierarchy', '');
        return;
      }

      const wrapperInstance = this.reportComponentRef.instance as SkipDynamicReportWrapperComponent;

      // Wait for the component to be fully initialized
      // React components need time to resolve their specs
      setTimeout(() => {
        const resolvedSpec = wrapperInstance.getResolvedComponentSpec();

        if (resolvedSpec) {
          // Build hierarchy from the resolved spec
          this.componentHierarchy = this.buildComponentNode(resolvedSpec);
          this.cdRef.detectChanges();
          LogStatus('Successfully loaded component hierarchy from React component', this.componentHierarchy.name);
        } else {
          // Try again after a longer delay if spec isn't ready yet
          setTimeout(() => {
            const retrySpec = wrapperInstance.getResolvedComponentSpec();
            if (retrySpec) {
              this.componentHierarchy = this.buildComponentNode(retrySpec);
              this.cdRef.detectChanges();
              LogStatus('Successfully loaded component hierarchy from React component (retry)', this.componentHierarchy.name);
            } else {
              LogError('React component does not have resolved spec yet after retry', '');
            }
          }, 1000);
        }
      }, 500);
    } catch (error) {
      LogError('Error loading component hierarchy for feedback', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Build a ComponentNode from component spec
   */
  private buildComponentNode(spec: any): ComponentNode {
    const node: ComponentNode = {
      name: spec.name,
      title: spec.title || spec.name,
      description: spec.description,
      location: spec.location || 'embedded',
      namespace: spec.namespace,
      registry: spec.registry
    };

    // Recursively build dependency nodes
    if (spec.dependencies && Array.isArray(spec.dependencies)) {
      node.dependencies = spec.dependencies.map((dep: any) => this.buildComponentNode(dep));
    }

    return node;
  }

  /**
   * Handle component selection for feedback
   */
  public onComponentSelected(component: ComponentNode): void {
    this.selectedFeedbackComponent = component;
  }

  /**
   * Handle feedback submission
   */
  public async onFeedbackSubmitted(feedback: ComponentFeedback): Promise<void> {
    try {
      LogStatus('Submitting component feedback', JSON.stringify(feedback));

      // Use the GraphQLComponentRegistryClient for registry-agnostic feedback submission
      const provider = this.ProviderToUse as GraphQLDataProvider;
      const registryClient = new GraphQLComponentRegistryClient(provider);

      const result = await registryClient.SendComponentFeedback({
        componentName: feedback.componentName,
        componentNamespace: feedback.componentNamespace,
        componentVersion: feedback.componentVersion,
        registryName: this.selectedFeedbackComponent?.registry || 'Skip',
        rating: feedback.rating, // Already converted to 0-100 scale in the panel component
        feedbackType: 'Stars',
        comments: feedback.comments,
        conversationID: feedback.conversationID,
        conversationDetailID: feedback.conversationDetailID,
        reportID: feedback.reportID,
        dashboardID: feedback.dashboardID
      });

      if (result?.success) {
        this.notificationService.CreateSimpleNotification(
          'Feedback submitted successfully!',
          'success',
          3000
        );
        LogStatus('Component feedback submitted successfully', result.feedbackID);

        // Close the feedback panel after successful submission
        this.closeFeedbackPanel();
      } else {
        const errorMsg = result?.error || 'Failed to submit feedback';
        this.notificationService.CreateSimpleNotification(
          `Error: ${errorMsg}`,
          'error',
          5000
        );
        LogError('Failed to submit component feedback', errorMsg);
      }
    } catch (error) {
      LogError('Error submitting component feedback', error instanceof Error ? error.message : String(error));
      this.notificationService.CreateSimpleNotification(
        'An unexpected error occurred while submitting feedback',
        'error',
        5000
      );
    }
  }

  /**
   * Close the feedback panel
   */
  public closeFeedbackPanel(): void {
    this.showFeedbackPanel = false;
    this.selectedFeedbackComponent = null;
  }

  ngOnDestroy(): void {
    // CRITICAL: Clean up dynamically created report component to prevent zombie components
    this.destroyReportComponent();
    
    // Clear the view container to ensure no lingering references
    if (this.reportContainer) {
      this.reportContainer.clear();
    }
    
    // Reset state
    this.artifact = null;
    this.artifactVersion = null;
    this.artifactType = null;
    this.conversationDetailRecord = null;
    this.displayContent = null;
    this.artifactVersions.length = 0;
    this.isLoading = false;
    this.error = null;
  }
}