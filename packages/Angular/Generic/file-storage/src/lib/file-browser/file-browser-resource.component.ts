import { Component } from '@angular/core';
// This component is an Explorer surface (layer 3), which is why the package declares
// "mjUILayer": "surface" rather than "widgets" — a package holding a BaseResourceComponent
// subclass cannot be widgets by the gate's own table, and ng-shared is legal at L3.
// Splitting the surface out from the widgets in this package is still worth doing (MJ#3404);
// it is registered in three CodeGen-generated manifests, so it needs a CodeGen run, not a
// hand edit.
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
    }
    .file-browser-resource-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    /* The inner mj-file-browser needs to fill the container. */
    .file-browser-resource-container :is(mj-file-browser) {
      flex: 1;
      min-height: 0;
      min-width: 0;
      display: flex;
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
    // Defer to next microtask so the shell's LoadCompleteEvent callback
    // is wired before we fire NotifyLoadComplete
    await Promise.resolve();
    this.NotifyLoadComplete();
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
