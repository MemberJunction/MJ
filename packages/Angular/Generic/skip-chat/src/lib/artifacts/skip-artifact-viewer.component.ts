import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild, ViewContainerRef, ComponentRef, AfterViewInit, ComponentFactoryResolver, Injector } from '@angular/core';
import { ConversationArtifactEntity, ArtifactTypeEntity, ConversationArtifactVersionEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { LogError } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { SkipDynamicReportWrapperComponent } from '../dynamic-report/skip-dynamic-report-wrapper';

@Component({
  selector: 'skip-artifact-viewer',
  templateUrl: './skip-artifact-viewer.component.html',
  styleUrls: ['./skip-artifact-viewer.component.css']
})
export class SkipArtifactViewerComponent extends BaseAngularComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() public ArtifactID: string = '';
  @Input() public ArtifactVersionID: string = '';
  
  @ViewChild('reportContainer', { read: ViewContainerRef, static: false }) reportContainer!: ViewContainerRef;
  
  public isLoading: boolean = false;
  public artifact: any = null;
  public artifactVersion: any = null;
  public artifactType: any = null;
  public contentType: string = '';
  public displayContent: any = null;
  public error: string | null = null;
  public artifactVersions: any[] = [];
  public selectedVersionId: string = '';
  private reportComponentRef: ComponentRef<any> | null = null;

  constructor(
    private notificationService: MJNotificationService,
    private componentFactoryResolver: ComponentFactoryResolver,
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
    if (this.artifact && this.artifactVersion && this.reportContainer) {
      this.createReportComponent();
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
        await this.loadSpecificArtifactVersion(this.ArtifactVersionID);
      } else if (this.artifactVersions.length > 0) {
        // Use the latest version (first in the list since we sort by Version DESC)
        this.artifactVersion = this.artifactVersions[0];
        this.selectedVersionId = this.artifactVersion.ID;
      } else {
        throw new Error('No artifact versions found');
      }
      
      // Create the report component if view has been initialized
      if (this.reportContainer) {
        this.createReportComponent();
      }
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
      ExtraFilter: `ArtifactID = '${this.ArtifactID}'`
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
  private async loadSpecificArtifactVersion(versionId: string): Promise<void> {
    const runView = new RunView(this.RunViewToUse);
    const versionResult = await runView.RunView<ConversationArtifactVersionEntity>({
      EntityName: 'MJ: Conversation Artifact Versions',
      ResultType: 'entity_object',
      ExtraFilter: `ID = '${versionId}'`
    });

    if (!versionResult || !versionResult.Success || versionResult.Results.length === 0) {
      throw new Error(`Failed to load artifact version: ${versionId}`);
    }

    this.artifactVersion = versionResult.Results[0];
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
        await this.loadSpecificArtifactVersion(this.selectedVersionId);

        // Create the new report component
        this.createReportComponent();
      } catch (err) {
        LogError('Error changing artifact version', err instanceof Error ? err.message : String(err));
        this.error = err instanceof Error ? err.message : 'Unknown error loading artifact version';
        this.notificationService.CreateSimpleNotification(
          'Error loading artifact version', 
          'error',
          3000
        );
      } finally {
        this.isLoading = false;
      }
    }
  }

  /**
   * Creates the report component using the current artifact version Configuration
   */
  private createReportComponent(): void {
    if (!this.reportContainer || !this.artifactVersion) {
      return;
    }

    // Clear any existing component
    this.destroyReportComponent();
    this.reportContainer.clear();

    try {
      // Create the report component based on Configuration
      const componentFactory = this.componentFactoryResolver.resolveComponentFactory(SkipDynamicReportWrapperComponent);
      this.reportComponentRef = this.reportContainer.createComponent(componentFactory);

      if (this.reportComponentRef) {
        const instance = this.reportComponentRef.instance;
        
        // Parse the Configuration JSON if it's a string
        let configData;
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

        // Set properties on the report component
        instance.SkipData = configData;
        instance.Provider = this.ProviderToUse;
        instance.RunViewProvider = this.RunViewToUse;
        instance.AllowDrillDown = false; // Disable drill-down in artifact viewer for simplicity
      }
    } catch (err) {
      LogError('Error creating report component', err instanceof Error ? err.message : String(err));
      this.error = 'Failed to create artifact viewer component';
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

  public get isPlainText(): boolean {
    return this.contentType.includes('text/plain');
  }
}