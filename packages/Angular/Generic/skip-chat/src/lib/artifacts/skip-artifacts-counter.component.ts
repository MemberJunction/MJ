import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { ConversationArtifactEntity, ArtifactTypeEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { LogError } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  standalone: false,
  selector: 'skip-artifacts-counter',
  templateUrl: './skip-artifacts-counter.component.html',
  styleUrls: ['./skip-artifacts-counter.component.css']
})
export class SkipArtifactsCounterComponent extends BaseAngularComponent implements OnChanges {
  @Input() public ConversationID: string = '';
  @Output() public ArtifactSelected = new EventEmitter<any>();
  
  public isLoading: boolean = false;
  public showDropdown: boolean = false;
  public artifacts: any[] = [];
  public artifactCount: number = 0;
  public error: string | null = null;

  constructor(private notificationService: MJNotificationService) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ConversationID'] && this.ConversationID) {
      this.loadArtifacts();
    }
  }

  private async loadArtifacts(): Promise<void> {
    if (!this.ConversationID) {
      this.artifacts = [];
      this.artifactCount = 0;
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const provider = this.ProviderToUse;
      
      // Get artifacts for this conversation
      // Use RunView to execute the query
      const runView = new RunView(this.RunViewToUse);
      const artifactsResult = await runView.RunView<ConversationArtifactEntity>({
        EntityName: 'ConversationArtifact',
        ResultType: 'entity_object',
        ExtraFilter: `ConversationID = '${this.ConversationID}'`
      });

      if (artifactsResult && artifactsResult.Success && artifactsResult.Results.length > 0) {
        this.artifacts = artifactsResult.Results;
        this.artifactCount = artifactsResult.Results.length;
      } else {
        this.artifacts = [];
        this.artifactCount = 0;
      }

      // If we have artifacts, load their types for better display
      if (this.artifactCount > 0) {
        await this.loadArtifactTypes();
      }
    } catch (err) {
      LogError('Error loading artifacts for conversation', err instanceof Error ? err.message : String(err));
      this.error = err instanceof Error ? err.message : 'Unknown error loading artifacts';
      this.notificationService.CreateSimpleNotification(
        'Error loading artifacts', 
        'error',
        3000
      );

      this.artifacts = [];
      this.artifactCount = 0;
    } finally {
      this.isLoading = false;
    }
  }

  private async loadArtifactTypes(): Promise<void> {
    try {
      const provider = this.ProviderToUse;

      // Get all artifact types
      // Use RunView to execute the query
      const runView = new RunView(this.RunViewToUse);
      const typesResult = await runView.RunView<ArtifactTypeEntity>({
        EntityName: 'ArtifactType',
        ResultType: 'entity_object'
      });

      if (typesResult && typesResult.Success && typesResult.Results.length > 0) {
        // Create a map for quick lookup
        const typeMap = typesResult.Results.reduce((map: any, type: any) => {
          map[type.ID] = type;
          return map;
        }, {});

        // Add type information to artifacts
        this.artifacts = this.artifacts.map(artifact => {
          const type = typeMap[artifact.ArtifactTypeID];
          return {
            ...artifact,
            typeName: type ? type.Name : 'Unknown',
            contentType: type ? type.ContentType : 'text/plain'
          };
        });
      }
    } catch (err) {
      LogError('Error loading artifact types', err instanceof Error ? err.message : String(err));
    }
  }

  public toggleDropdown(event: MouseEvent): void {
    // First refresh our data to ensure it's up to date
    if (!this.showDropdown) {
      this.loadArtifacts();
    }
    
    this.showDropdown = !this.showDropdown;
    event.stopPropagation();
  }

  public closeDropdown(): void {
    this.showDropdown = false;
  }

  public selectArtifact(artifact: any, event: MouseEvent): void {
    this.ArtifactSelected.emit(artifact);
    this.closeDropdown();
    event.stopPropagation();
  }

  public getIconClass(contentType: string): string {
    if (!contentType) return 'fa-file';
    
    if (contentType.includes('markdown')) return 'fa-file-alt';
    if (contentType.includes('json')) return 'fa-file-code';
    if (contentType.includes('javascript') || 
        contentType.includes('typescript') || 
        contentType.includes('python') || 
        contentType.includes('java') || 
        contentType.includes('csharp')) return 'fa-file-code';
    if (contentType.includes('html')) return 'fa-file-code';
    if (contentType.includes('sql')) return 'fa-database';
    if (contentType.includes('image')) return 'fa-file-image';
    
    return 'fa-file';
  }
}