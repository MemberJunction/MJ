import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Type
} from '@angular/core';
import { ArtifactVersionEntity, ArtifactTypeEntity } from '@memberjunction/core-entities';
import { Metadata, LogError, RunView } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { IArtifactViewerComponent } from '../interfaces/artifact-viewer-plugin.interface';
import { BaseArtifactViewerPluginComponent } from './base-artifact-viewer.component';

/**
 * Artifact type plugin viewer that loads the appropriate plugin based on the artifact's DriverClass.
 * Uses MJGlobal.Instance.ClassFactory.CreateInstance() to dynamically load viewer plugins.
 */
@Component({
  selector: 'mj-artifact-type-plugin-viewer',
  template: `
    <div class="artifact-type-plugin-viewer">
      @if (isLoading) {
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading artifact viewer...</span>
        </div>
      }
      @if (error) {
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ error }}</span>
        </div>
      }
      <ng-container #viewerContainer></ng-container>
    </div>
  `,
  styles: [`
    .artifact-type-plugin-viewer {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .loading-state,
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      gap: 16px;
      color: #6c757d;
    }

    .loading-state i {
      font-size: 32px;
    }

    .error-state {
      color: #dc3545;
    }

    .error-state i {
      font-size: 32px;
    }
  `]
})
export class ArtifactTypePluginViewerComponent implements OnInit, OnChanges {
  @Input() artifactVersion!: ArtifactVersionEntity;
  @Input() artifactTypeName!: string;
  @Input() contentType?: string;
  @Input() height?: string;
  @Input() readonly: boolean = true;
  @Input() cssClass?: string;

  @ViewChild('viewerContainer', { read: ViewContainerRef, static: true })
  viewerContainer!: ViewContainerRef;

  public isLoading = true;
  public error: string | null = null;

  private componentRef: ComponentRef<any> | null = null;

  /**
   * Get the loaded plugin instance (if available)
   */
  public get pluginInstance(): BaseArtifactViewerPluginComponent | null {
    return this.componentRef?.instance as BaseArtifactViewerPluginComponent || null;
  }

  async ngOnInit(): Promise<void> {
    await this.loadViewer();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if ((changes['artifactVersion'] || changes['artifactTypeName']) &&
        !changes['artifactVersion']?.firstChange) {
      await this.loadViewer();
    }
  }

  ngOnDestroy(): void {
    this.destroyCurrentViewer();
  }

  /**
   * Load the appropriate viewer plugin for the artifact
   */
  private async loadViewer(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      if (!this.artifactVersion) {
        this.error = 'No artifact version provided';
        this.isLoading = false;
        return;
      }

      if (!this.artifactTypeName) {
        this.error = 'No artifact type name provided';
        this.isLoading = false;
        return;
      }

      // Get the artifact type entity to find the DriverClass
      const artifactType = await this.getArtifactType();
      if (!artifactType) {
        this.error = `Artifact type "${this.artifactTypeName}" not found`;
        this.isLoading = false;
        return;
      }

      // Resolve DriverClass by traversing parent hierarchy if needed
      const driverClass = await this.resolveDriverClass(artifactType);
      if (!driverClass) {
        this.error = `No DriverClass found in artifact type hierarchy for "${this.artifactTypeName}" and no valid JSON content for fallback`;
        this.isLoading = false;
        return;
      }

      // Get the component type using MJGlobal ClassFactory
      // CreateInstance returns the registered component class for the given DriverClass key
      const tempInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactViewerPluginComponent>(
        BaseArtifactViewerPluginComponent,
        driverClass
      );

      if (!tempInstance) {
        this.error = `Component "${driverClass}" not found. Make sure the component is registered with @RegisterClass decorator.`;
        this.isLoading = false;
        return;
      }

      // Get the component type from the instance
      const componentType = tempInstance.constructor as Type<BaseArtifactViewerPluginComponent>;

      // Destroy previous viewer if exists
      this.destroyCurrentViewer();

      // Create and configure the viewer component
      this.componentRef = this.viewerContainer.createComponent(componentType);
      const componentInstance = this.componentRef.instance as IArtifactViewerComponent;

      // Set inputs
      componentInstance.artifactVersion = this.artifactVersion;
      if (this.height !== undefined) {
        (componentInstance as any).height = this.height;
      }
      if (this.readonly !== undefined) {
        (componentInstance as any).readonly = this.readonly;
      }
      if (this.cssClass !== undefined) {
        (componentInstance as any).cssClass = this.cssClass;
      }
      if (this.contentType !== undefined) {
        (componentInstance as any).contentType = this.contentType;
      }

      // Trigger change detection
      this.componentRef.changeDetectorRef.detectChanges();

      this.isLoading = false;
    } catch (err) {
      console.error('Error loading artifact viewer:', err);
      LogError(err);
      this.error = 'Failed to load artifact viewer: ' + (err instanceof Error ? err.message : String(err));
      this.isLoading = false;
    }
  }

  /**
   * Get the artifact type entity for the current artifact
   */
  private async getArtifactType(): Promise<ArtifactTypeEntity | null> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ArtifactTypeEntity>({
        EntityName: 'MJ: Artifact Types',
        ExtraFilter: `Name='${this.artifactTypeName}'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results && result.Results.length > 0) {
        return result.Results[0];
      }

      return null;
    } catch (err) {
      console.error('Error loading artifact type:', err);
      return null;
    }
  }

  /**
   * Resolves the DriverClass for an artifact type by traversing up the parent hierarchy.
   * Falls back to JSON viewer if content is valid JSON and no DriverClass is found.
   *
   * @param artifactType The artifact type to resolve the DriverClass for
   * @returns The DriverClass string, or null if none found and no JSON fallback available
   */
  private async resolveDriverClass(artifactType: ArtifactTypeEntity): Promise<string | null> {
    // Check if current artifact type has a DriverClass
    if (artifactType.DriverClass) {
      console.log(`✅ Found DriverClass '${artifactType.DriverClass}' on artifact type '${artifactType.Name}'`);
      return artifactType.DriverClass;
    }

    // No DriverClass on current type - check if it has a parent
    if (artifactType.ParentID) {
      console.log(`🔍 No DriverClass on '${artifactType.Name}', checking parent...`);
      const parentType = await this.getArtifactTypeById(artifactType.ParentID);

      if (parentType) {
        // Recursively check parent
        return await this.resolveDriverClass(parentType);
      } else {
        console.warn(`⚠️ Parent artifact type '${artifactType.ParentID}' not found`);
      }
    }

    // Reached root with no DriverClass - check for JSON fallback
    console.log(`📄 No DriverClass found in hierarchy for '${artifactType.Name}', checking JSON fallback...`);
    return this.checkJsonFallback();
  }

  /**
   * Loads an artifact type by ID
   */
  private async getArtifactTypeById(id: string): Promise<ArtifactTypeEntity | null> {
    try {
      const md = new Metadata();
      const artifactType = await md.GetEntityObject<ArtifactTypeEntity>('MJ: Artifact Types');
      const loaded = await artifactType.Load(id);

      if (loaded) {
        return artifactType;
      }

      return null;
    } catch (err) {
      console.error('Error loading artifact type by ID:', err);
      return null;
    }
  }

  /**
   * Checks if the artifact content is valid JSON and returns the JSON viewer plugin if so
   */
  private checkJsonFallback(): string | null {
    if (!this.artifactVersion || !this.artifactVersion.Content) {
      console.log('❌ No content available for JSON fallback');
      return null;
    }

    try {
      // Try to parse the content as JSON
      JSON.parse(this.artifactVersion.Content);
      console.log('✅ Content is valid JSON, using JsonArtifactViewerPlugin as fallback');
      return 'JsonArtifactViewerPlugin';
    } catch {
      console.log('❌ Content is not valid JSON, no fallback available');
      return null;
    }
  }

  /**
   * Destroy the current viewer component
   */
  private destroyCurrentViewer(): void {
    if (this.componentRef) {
      this.componentRef.destroy();
      this.componentRef = null;
    }
    this.viewerContainer.clear();
  }
}
