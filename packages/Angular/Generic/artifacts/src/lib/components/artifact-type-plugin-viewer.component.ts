import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Type
} from '@angular/core';
import { MJArtifactVersionEntity, MJArtifactTypeEntity, ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { Metadata, LogError, RunView, CompositeKey } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { IArtifactViewerComponent } from '../interfaces/artifact-viewer-plugin.interface';
import { BaseArtifactViewerPluginComponent, NavigationRequest } from './base-artifact-viewer.component';

/**
 * Artifact type plugin viewer that loads the appropriate plugin based on the artifact's DriverClass.
 * Uses MJGlobal.Instance.ClassFactory.CreateInstance() to dynamically load viewer plugins.
 */
@Component({
  standalone: false,
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
          @if (errorTitle) {
            <div class="error-title">{{ errorTitle }}</div>
          }
          <div class="error-details">{{ error }}</div>
          @if (errorDetails) {
            <div class="error-tech-details">{{ errorDetails }}</div>
          }
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

    .artifact-type-plugin-viewer ::ng-deep > * {
      flex: 1;
      min-height: 0;
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
      width: 100%;
      height: 100%;
      min-height: 200px;
    }

    .loading-state i {
      font-size: 32px;
    }

    .error-state {
      color: #dc3545;
      text-align: center;
      max-width: 600px;
    }

    .error-state i {
      font-size: 32px;
    }

    .error-state .error-title {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 8px;
    }

    .error-state .error-details {
      font-size: 14px;
      line-height: 1.5;
      color: #6c757d;
    }

    .error-state .error-tech-details {
      margin-top: 12px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      color: #495057;
      word-break: break-word;
    }
  `]
})
export class ArtifactTypePluginViewerComponent implements OnInit, OnChanges {
  @Input() artifactVersion!: MJArtifactVersionEntity;
  @Input() artifactTypeName!: string;
  @Input() contentType?: string;
  @Input() height?: string;
  @Input() readonly: boolean = true;
  @Input() cssClass?: string;

  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
  @Output() pluginLoaded = new EventEmitter<void>();
  @Output() tabsChanged = new EventEmitter<void>();

  @ViewChild('viewerContainer', { read: ViewContainerRef, static: true })
  viewerContainer!: ViewContainerRef;

  public isLoading = true;
  public error: string | null = null;
  public errorDetails: string | null = null;
  public errorTitle: string | null = null;

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
      this.errorTitle = null;
      this.errorDetails = null;

      if (!this.artifactVersion) {
        this.setError(
          'Missing Artifact Data',
          'Unable to display this artifact because the version information is missing.',
          'artifactVersion is null or undefined'
        );
        this.isLoading = false;
        return;
      }

      if (!this.artifactTypeName) {
        this.setError(
          'Missing Artifact Type',
          'Unable to display this artifact because the type information is missing.',
          'artifactTypeName is empty'
        );
        this.isLoading = false;
        return;
      }

      // Get the artifact type entity to find the DriverClass
      const artifactType = await this.getArtifactType();
      if (!artifactType) {
        this.setError(
          'Unknown Artifact Type',
          `The artifact type "${this.artifactTypeName}" is not recognized. This might be a custom type that hasn't been properly configured.`,
          `Artifact type "${this.artifactTypeName}" not found in metadata`
        );
        this.isLoading = false;
        return;
      }

      // Resolve DriverClass by traversing parent hierarchy if needed
      const driverClass = await this.resolveDriverClass(artifactType);
      if (!driverClass) {
        this.setError(
          'No Viewer Available',
          `This artifact type (${this.artifactTypeName}) doesn't have a viewer component configured. The artifact content may need to be viewed in the JSON tab.`,
          `No DriverClass in hierarchy and content is not valid JSON`
        );
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
        this.setError(
          'Viewer Component Not Found',
          `The viewer component "${driverClass}" is not registered in the application. This usually means the required package or module hasn't been loaded.`,
          `Component "${driverClass}" not found in ClassFactory registry. Ensure it's registered with @RegisterClass(BaseArtifactViewerPluginComponent, '${driverClass}').`
        );
        this.isLoading = false;
        return;
      }

      // Get the component type from the instance
      const componentType = tempInstance.constructor as Type<BaseArtifactViewerPluginComponent>;

      // Destroy previous viewer if exists
      this.destroyCurrentViewer();

      // Create and configure the viewer component
      this.componentRef = this.viewerContainer.createComponent(componentType);

      // Set inputs using setInput() which properly triggers ngOnChanges
      // This is critical for plugins like ComponentArtifactViewerComponent that
      // need to process the artifactVersion in ngOnChanges before pluginLoaded fires
      this.componentRef.setInput('artifactVersion', this.artifactVersion);
      if (this.height !== undefined) {
        this.componentRef.setInput('height', this.height);
      }
      if (this.readonly !== undefined) {
        this.componentRef.setInput('readonly', this.readonly);
      }
      if (this.cssClass !== undefined) {
        this.componentRef.setInput('cssClass', this.cssClass);
      }
      if (this.contentType !== undefined) {
        this.componentRef.setInput('contentType', this.contentType);
      }

      // Subscribe to openEntityRecord event if the plugin emits it
      const componentInstance = this.componentRef.instance;
      if (componentInstance.openEntityRecord) {
        componentInstance.openEntityRecord.subscribe((event: {entityName: string; compositeKey: CompositeKey}) => {
          this.openEntityRecord.emit(event);
        });
      }

      // Subscribe to navigationRequest event if the plugin emits it
      if (componentInstance.navigationRequest) {
        componentInstance.navigationRequest.subscribe((event: NavigationRequest) => {
          this.navigationRequest.emit(event);
        });
      }

      // Subscribe to tabsChanged event if the plugin emits it (e.g., after async spec loading)
      if (componentInstance.tabsChanged) {
        componentInstance.tabsChanged.subscribe(() => {
          this.tabsChanged.emit();
        });
      }

      // Trigger change detection
      this.componentRef.changeDetectorRef.detectChanges();

      this.isLoading = false;

      // Notify parent that plugin has loaded (for tab selection timing)
      this.pluginLoaded.emit();
    } catch (err) {
      console.error('Error loading artifact viewer:', err);
      LogError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error && err.stack ? err.stack : undefined;
      this.setError(
        'Failed to Load Viewer',
        'An unexpected error occurred while loading the artifact viewer. Please try refreshing the page or contact support if the problem persists.',
        errorStack || errorMessage
      );
      this.isLoading = false;
    }
  }

  /**
   * Set a structured error message with title, user-friendly description, and technical details
   */
  private setError(title: string, userMessage: string, technicalDetails: string): void {
    this.errorTitle = title;
    this.error = userMessage;
    this.errorDetails = technicalDetails;
  }

  /**
   * Get the artifact type entity for the current artifact using the cached ArtifactMetadataEngine
   */
  private async getArtifactType(): Promise<MJArtifactTypeEntity | null> {
    try {
      // Use the cached metadata engine instead of querying the database
      const artifactType = ArtifactMetadataEngine.Instance.FindArtifactType(this.artifactTypeName);
      return artifactType || null;
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
  private async resolveDriverClass(artifactType: MJArtifactTypeEntity): Promise<string | null> {
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
  private async getArtifactTypeById(id: string): Promise<MJArtifactTypeEntity | null> {
    try {
      const md = new Metadata();
      const artifactType = await md.GetEntityObject<MJArtifactTypeEntity>('MJ: Artifact Types');
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
