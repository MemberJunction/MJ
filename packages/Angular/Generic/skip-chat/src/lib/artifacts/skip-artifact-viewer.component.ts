import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild, ViewContainerRef, ComponentRef, AfterViewInit, ComponentFactoryResolver, Injector, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { ConversationArtifactEntity, ArtifactTypeEntity, ConversationArtifactVersionEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { RunView, LogError } from '@memberjunction/core';
import { DataContext } from '@memberjunction/data-context';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { SkipDynamicReportWrapperComponent } from '../dynamic-report/skip-dynamic-report-wrapper';
import { SkipAPIResponse, SkipAPIAnalysisCompleteResponse, SkipResponsePhase } from '@memberjunction/skip-types';
import { DrillDownInfo } from '../drill-down-info';

@Component({
  selector: 'skip-artifact-viewer',
  templateUrl: './skip-artifact-viewer.component.html',
  styleUrls: ['./skip-artifact-viewer.component.css']
})
export class SkipArtifactViewerComponent extends BaseAngularComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() public ArtifactID: string = '';
  @Input() public ArtifactVersionID: string = '';
  @Input() public DataContext: DataContext | null = null;
  
  @ViewChild('reportContainer', { read: ViewContainerRef, static: false }) reportContainer!: ViewContainerRef;
  
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
  private conversationDetailRecord: ConversationDetailEntity | null = null;

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
        throw new Error(`Failed to load artifact: ${artifactEntity.LatestResult.Message}`);
      }

      this.artifact = artifactEntity;
      
      // Load the artifact type
      const artifactTypeEntity = await provider.GetEntityObject<ArtifactTypeEntity>('MJ: Artifact Types', provider.CurrentUser);
      if (!await artifactTypeEntity.Load(this.artifact.ArtifactTypeID)) {
        throw new Error(`Failed to load artifact type: ${artifactTypeEntity.LatestResult.Message}`);
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
        
        if (this.conversationDetailRecord && 
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
        
        // If we couldn't get data from AI message, try using the artifact version Configuration
        if (!configData) {
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
        }
        
        if (!configData) {
          throw new Error('No valid configuration data found');
        }

        // Set properties on the report component
        instance.SkipData = configData;
        instance.Provider = this.ProviderToUse;
        
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

  public get isPlainText(): boolean {
    return this.contentType.includes('text/plain');
  }
}