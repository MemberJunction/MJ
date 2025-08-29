import { Component, OnInit } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { RunView, Metadata, UserInfo } from '@memberjunction/core';
import { ConversationArtifactEntity, ConversationArtifactVersionEntity } from '@memberjunction/core-entities';

export interface ArtifactSelectionResult {
  artifact: ConversationArtifactEntity;
  action: 'new-version' | 'update-version';
  versionToUpdate?: ConversationArtifactVersionEntity;
}

@Component({
  selector: 'app-artifact-selection-dialog',
  templateUrl: './artifact-selection-dialog.component.html',
  styleUrl: './artifact-selection-dialog.component.css'
})
export class ArtifactSelectionDialogComponent implements OnInit {
  // Data
  artifacts: ConversationArtifactEntity[] = [];
  artifactVersions: ConversationArtifactVersionEntity[] = [];
  
  // Paging State
  currentPage = 0;
  pageSize = 25;
  totalArtifacts = 0;
  hasMorePages = false;
  
  // UI State
  isLoading = true;
  searchTerm = '';
  showMyArtifactsOnly = false;
  showComponentsOnly = true;
  showNewArtifactForm = false;
  
  // Selection State
  selectedArtifact: ConversationArtifactEntity | null = null;
  selectedVersion: ConversationArtifactVersionEntity | null = null;
  versionAction: 'new' | 'update' = 'new';
  
  // New Artifact Form
  newArtifactName = '';
  newArtifactDescription = '';
  
  private metadata = new Metadata();
  private currentUser: UserInfo | null = null;

  constructor(
    public dialog: DialogRef
  ) {}

  async ngOnInit() {
    await this.filterArtifacts();
  }

  async loadArtifacts() {
    this.isLoading = true;
    try {
      const rv = new RunView();       
      
      // Calculate StartRow for server-side paging
      const startRow = this.currentPage * this.pageSize;
      
      // Load artifacts with paging
      const result = await rv.RunView<ConversationArtifactEntity>({
        ExtraFilter: this._artifactFilter,
        EntityName: 'MJ: Conversation Artifacts',
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: this.pageSize + 1, // Load one extra to check if more pages exist
        StartRow: startRow,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        // Check if we have more pages by seeing if we got the extra record
        this.hasMorePages = result.Results.length > this.pageSize;
        
        // Remove the extra record if it exists
        this.artifacts = result.Results.slice(0, this.pageSize);
      }
    } catch (error) {
      console.error('Error loading artifacts:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private _artifactFilter: string | undefined= undefined;
  public async filterArtifacts() {
    // Reset to first page when filters change
    this.currentPage = 0;
    
    // Filter by search term
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      this._artifactFilter = `Name LIKE '%${term}%' OR Description LIKE '%${term}%'`;
    } else {
      this._artifactFilter = undefined;
    }
    
    // Filter by user if needed
    if (this.showMyArtifactsOnly && this.currentUser) {
      const md = new Metadata();
      const schemaName = md.EntityByName("Conversations")?.SchemaName || "__mj";
      const userFilter = `ConversationID IN(SELECT ID FROM ${schemaName}.vwConversations WHERE UserID='${this.currentUser.ID}')`;
      this._artifactFilter = this._artifactFilter ? `${this._artifactFilter} AND ${userFilter}` : userFilter;
    }

    await this.loadArtifacts();
  }

  selectCreateNew() {
    this.showNewArtifactForm = true;
    this.selectedArtifact = null;
    this.selectedVersion = null;
  }

  async selectArtifact(artifact: ConversationArtifactEntity) {
    this.selectedArtifact = artifact;
    this.showNewArtifactForm = false;
    this.versionAction = 'new';
    this.selectedVersion = null;
    
    // Load versions for this artifact
    await this.loadVersions(artifact.ID);
  }

  async loadVersions(artifactId: string) {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ConversationArtifactVersionEntity>({
        EntityName: 'MJ: Conversation Artifact Versions',
        ExtraFilter: `ConversationArtifactID = '${artifactId}'`,
        OrderBy: 'Version DESC',
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.artifactVersions = result.Results;
      }
    } catch (error) {
      console.error('Error loading versions:', error);
      this.artifactVersions = [];
    }
  }

  getNextVersionNumber(): number {
    if (this.artifactVersions.length === 0) return 1;
    return Math.max(...this.artifactVersions.map(v => v.Version)) + 1;
  }

  // Paging methods
  async nextPage() {
    if (this.hasMorePages) {
      this.currentPage++;
      await this.loadArtifacts();
    }
  }

  async previousPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      await this.loadArtifacts();
    }
  }

  canGoNext(): boolean {
    return this.hasMorePages;
  }

  canGoPrevious(): boolean {
    return this.currentPage > 0;
  }

  canSave(): boolean {
    if (this.showNewArtifactForm) {
      return this.newArtifactName.trim().length > 0;
    }
    
    if (!this.selectedArtifact) return false;
    
    if (this.versionAction === 'update') {
      return this.selectedVersion !== null;
    }
    
    return true;
  }

  getSaveButtonText(): string {
    if (this.showNewArtifactForm) {
      return 'Create & Save';
    }
    
    if (this.versionAction === 'update' && this.selectedVersion) {
      return `Update Version ${this.selectedVersion.Version}`;
    }
    
    return `Save as Version ${this.getNextVersionNumber()}`;
  }

  cancel() {
    this.dialog.close();
  }

  async save() {
    if (!this.canSave()) return;
    
    // Handle new artifact creation
    if (this.showNewArtifactForm) {
      const newArtifact = await this.createNewArtifact();
      if (newArtifact) {
        const result: ArtifactSelectionResult = {
          artifact: newArtifact,
          action: 'new-version'
        };
        this.dialog.close(result);
      }
      return;
    }
    
    // Handle existing artifact selection
    if (this.selectedArtifact) {
      const result: ArtifactSelectionResult = {
        artifact: this.selectedArtifact,
        action: this.versionAction === 'update' ? 'update-version' : 'new-version',
        versionToUpdate: this.versionAction === 'update' ? this.selectedVersion! : undefined
      };
      
      // If updating, show confirmation
      if (this.versionAction === 'update') {
        const confirm = window.confirm(
          `Are you sure you want to overwrite version ${this.selectedVersion!.Version}? This action cannot be undone.`
        );
        
        if (!confirm) return;
      }
      
      this.dialog.close(result);
    }
  }

  private async createNewArtifact(): Promise<ConversationArtifactEntity | null> {
    try {
      const artifact = await this.metadata.GetEntityObject<ConversationArtifactEntity>('MJ: Conversation Artifacts');
      artifact.Name = this.newArtifactName;
      artifact.Description = this.newArtifactDescription || null;
      
      // Get Component artifact type
      const rv = new RunView();
      const typeResult = await rv.RunView({
        EntityName: 'MJ: Artifact Types',
        ExtraFilter: `Name = 'Component'`,
        MaxRows: 1
      });

      if (typeResult.Success && typeResult.Results?.length > 0) {
        artifact.ArtifactTypeID = typeResult.Results[0].ID;
      }

      artifact.SharingScope = 'None';
      artifact.Comments = 'Created from Component Studio';

      const saveResult = await artifact.Save();
      if (saveResult) {
        return artifact;
      } else {
        console.error('Failed to create artifact:', artifact.LatestResult?.Message);
        alert('Failed to create artifact. Check console for details.');
        return null;
      }
    } catch (error) {
      console.error('Error creating artifact:', error);
      alert('Error creating artifact. Check console for details.');
      return null;
    }
  }
}