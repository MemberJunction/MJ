import { Component, ViewChild, AfterViewInit, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab } from '../base-artifact-viewer.component';
import { MJReactComponent, AngularAdapterService } from '@memberjunction/ng-react';
import { BuildComponentCompleteCode, ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Viewer component for interactive Component artifacts (React-based UI components)
 *
 * Features:
 * - Live component preview with React rendering
 * - Dynamic tabs for component metadata (via GetAdditionalTabs)
 * - Provides tabs for: Code, Functional Requirements, Technical Design, Data Requirements
 */
@Component({
  selector: 'mj-component-artifact-viewer',
  templateUrl: './component-artifact-viewer.component.html',
  styleUrls: ['./component-artifact-viewer.component.scss']
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'ComponentArtifactViewerPlugin')
export class ComponentArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, AfterViewInit, OnChanges {
  @ViewChild('reactComponent') reactComponent?: MJReactComponent;
  @Output() tabsChanged = new EventEmitter<void>();

  // Component data
  public component: ComponentSpec | null = null;
  public componentCode: string = "";
  public componentName: string = '';

  // Error state
  public hasError = false;
  public errorMessage = '';
  public errorDetails = '';

  constructor(private adapter: AngularAdapterService) {
    super();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // When artifactVersion input changes, reload the component spec
    if (changes['artifactVersion'] && !changes['artifactVersion'].firstChange) {
      await this.loadComponentSpec();
      // Notify parent that tabs may have changed
      this.tabsChanged.emit();
    }
  }

  private async loadComponentSpec(): Promise<void> {
    try {
      if (this.artifactVersion.Content) {
        this.component = SafeJSONParse(this.artifactVersion.Content) as ComponentSpec;
        this.extractComponentParts();
      } else {
        throw new Error('Artifact content is empty');
      }
    } catch (error) {
      console.error('Failed to load component spec:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to load component';
      this.errorDetails = error instanceof Error ? error.message : String(error);
    }
  }

  async ngOnInit(): Promise<void> {
    // Load initial component spec
    await this.loadComponentSpec();

    // Initialize Angular adapter for React components
    try {
      await this.adapter.initialize();
    } catch (error) {
      console.error('Failed to initialize Angular adapter:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to initialize component runtime';
      this.errorDetails = error instanceof Error ? error.message : String(error);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    // Component initialization happens automatically via mj-react-component
  }

  /**
   * Provide additional tabs for viewing component metadata
   */
  public GetAdditionalTabs(): ArtifactViewerTab[] {
    const tabs: ArtifactViewerTab[] = [];

    if (!this.component) {
      return tabs;
    }

    // Functional Requirements tab
    if (this.component.functionalRequirements) {
      tabs.push({
        label: 'Functional',
        icon: 'fa-clipboard-list',
        contentType: 'markdown',
        content: this.component.functionalRequirements
      });
    }

    // Technical Design tab
    if (this.component.technicalDesign) {
      tabs.push({
        label: 'Technical',
        icon: 'fa-wrench',
        contentType: 'markdown',
        content: this.component.technicalDesign
      });
    }

    // Data Requirements tab
    if (this.component.dataRequirements) {
      tabs.push({
        label: 'Data',
        icon: 'fa-database',
        contentType: 'json',
        content: JSON.stringify(this.component.dataRequirements, null, 2),
        language: 'json'
      });
    }

    // Code tab (lazy-loaded)
    tabs.push({
      label: 'Code',
      icon: 'fa-code',
      contentType: 'code',
      language: 'typescript',
      content: () => BuildComponentCompleteCode(this.component!)
    });

    return tabs;
  }

  private extractComponentParts(): void {
    if (this.component?.name) {
      this.componentName = this.component.name;
    }
    if (this.component?.code) {
      this.componentCode = BuildComponentCompleteCode(this.component);
    }
  }

  onComponentEvent(event: unknown): void {
    console.log('Component event:', event);
  }
}
