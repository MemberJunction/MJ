import { Component } from '@angular/core';

/**
 * Demo wrapper component for testing the file browser UI.
 * Navigate to this component to see the file browser in action.
 */
@Component({
  selector: 'mj-file-browser-demo',
  template: `
    <div style="height: 100vh; width: 100vw; display: flex; flex-direction: column;">
      <div style="padding: 16px; background-color: #f0f0f0; border-bottom: 1px solid #ccc;">
        <h1 style="margin: 0; font-size: 20px;">File Browser Demo</h1>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #666;">
          Testing the Mac Finder-style file browser component
        </p>
      </div>
      <div style="flex: 1; overflow: hidden;">
        <mj-file-browser></mj-file-browser>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
  `]
})
export class FileBrowserDemoComponent {}
