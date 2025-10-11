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
 * Dynamic artifact viewer that loads the appropriate plugin based on the artifact's DriverClass.
 * Uses MJGlobal.Instance.ClassFactory.CreateInstance() to dynamically load viewer plugins.
 */
@Component({
  selector: 'mj-artifact-viewer-dynamic',
  template: `
    <div class="artifact-viewer-dynamic">
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
    .artifact-viewer-dynamic {
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
export class ArtifactViewerDynamicComponent implements OnInit, OnChanges {
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

      const driverClass = artifactType.DriverClass;
      if (!driverClass) {
        this.error = `No DriverClass configured for artifact type "${this.artifactTypeName}"`;
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
