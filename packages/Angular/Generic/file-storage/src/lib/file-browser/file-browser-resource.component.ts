import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

/**
 * File Browser Resource Wrapper - displays the file browser in a tab
 * Extends BaseResourceComponent to work with the MJ resource type system
 */
@RegisterClass(BaseResourceComponent, 'FileBrowserResource')
@Component({
  standalone: false,
  selector: 'mj-file-browser-resource',
  template: `
    <div class="file-browser-resource-container">
      <mj-file-browser></mj-file-browser>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
    }
    .file-browser-resource-container {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
    }
  `]
})
export class FileBrowserResource extends BaseResourceComponent {
  private dataLoaded = false;

  constructor() {
    super();
  }

  override set Data(value: ResourceData) {
    super.Data = value;
    if (!this.dataLoaded) {
      this.dataLoaded = true;
      this.loadFileBrowser();
    }
  }

  override get Data(): ResourceData {
    return super.Data;
  }

  /**
   * Load the file browser (currently just notifies load complete)
   * In future phases, this could pass configuration from ResourceData
   */
  private async loadFileBrowser(): Promise<void> {
    this.NotifyLoadStarted();

    try {
      // File browser loads immediately
      // In future, could pass provider selection or folder path from Data.Configuration
      this.NotifyLoadComplete();
    } catch (error) {
      console.error('Error loading file browser:', error);
      this.NotifyLoadComplete();
    }
  }

  /**
   * Get the display name for the file browser resource
   */
  override async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return data.Name || 'File Browser';
  }

  /**
   * Get the icon class for file browser resources
   */
  override async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-tree';
  }
}
