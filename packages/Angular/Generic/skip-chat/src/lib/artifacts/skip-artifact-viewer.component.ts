import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { ConversationArtifactEntity, ArtifactTypeEntity, ConversationArtifactVersionEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { LogError } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  selector: 'skip-artifact-viewer',
  templateUrl: './skip-artifact-viewer.component.html',
  styleUrls: ['./skip-artifact-viewer.component.css']
})
export class SkipArtifactViewerComponent extends BaseAngularComponent implements OnInit, OnChanges {
  @Input() public ArtifactID: string = '';
  @Input() public ArtifactVersionID: string = '';
  
  public isLoading: boolean = false;
  public artifact: any = null;
  public artifactVersion: any = null;
  public artifactType: any = null;
  public contentType: string = '';
  public displayContent: any = null;
  public error: string | null = null;

  constructor(private notificationService: MJNotificationService) {
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

  private async loadArtifact(): Promise<void> {
    if (!this.ArtifactID) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const provider = this.ProviderToUse;
      
      // Load the artifact
      const artifactEntity = await provider.GetEntityObject<ConversationArtifactEntity>('ConversationArtifact', provider.CurrentUser);
      if (!await artifactEntity.Load(this.ArtifactID)) {
        throw new Error(`Failed to load artifact: ${artifactEntity.LatestResult.Message}`);
      }

      this.artifact = artifactEntity;
      
      // Load the artifact type
      const artifactTypeEntity = await provider.GetEntityObject<ArtifactTypeEntity>('ArtifactType', provider.CurrentUser);
      if (!await artifactTypeEntity.Load(this.artifact.ArtifactTypeID)) {
        throw new Error(`Failed to load artifact type: ${artifactTypeEntity.LatestResult.Message}`);
      }

      this.artifactType = artifactTypeEntity;
      this.contentType = this.artifactType.ContentType;

      // Load the artifact version - either the specific version or the latest
      const whereClause = this.ArtifactVersionID ? 
        `ID = '${this.ArtifactVersionID}'` : 
        `ArtifactID = '${this.ArtifactID}'`;
        
      // Use RunView to execute the query
      const runView = new RunView(this.RunViewToUse);
      const versionResult = await runView.RunView<ConversationArtifactVersionEntity>({
        EntityName: 'ConversationArtifactVersion',
        ResultType: 'entity_object',
        OrderBy: 'Version DESC',
        ExtraFilter: whereClause
      });

      if (!versionResult || !versionResult.Success || versionResult.Results.length === 0) {
        throw new Error('No artifact versions found');
      }

      this.artifactVersion = versionResult.Results[0];
      
      // Process content based on content type
      this.processContent();
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

  private processContent(): void {
    if (!this.artifactVersion || !this.contentType) {
      return;
    }

    try {
      const content = this.artifactVersion.Content;
      
      if (this.contentType.includes('json')) {
        // For JSON, we'll try to parse it and display it
        this.displayContent = JSON.parse(content);
      } else {
        // For other content types, just display as is
        this.displayContent = content;
      }
    } catch (err) {
      LogError('Error processing artifact content', err instanceof Error ? err.message : String(err));
      this.displayContent = this.artifactVersion.Content;
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