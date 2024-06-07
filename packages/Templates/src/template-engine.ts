import { Injectable, NgModule, Component } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { renderModule } from '@angular/platform-server';
import { ServerModule } from '@angular/platform-server';

@Component({
  selector: 'app-template-root', 
  template: 'hola' // This will be dynamically populated
})
class TemplateRootComponent {
  context: any = {}; // Data passed to the template
}

@NgModule({
  imports: [ServerModule], 
  declarations: [TemplateRootComponent],
  bootstrap: [TemplateRootComponent],
})
class TemplateRenderModule {}
 
// Dynamically create a component with the provided template
@Component({
    selector: 'app-dynamic-template',
    template: ''
})
class DynamicTemplateComponent {
    context: any = {};
}

// Dynamically create a module to house the component
@NgModule({
    imports: [TemplateRenderModule],
    declarations: [DynamicTemplateComponent]
})
class DynamicTemplateModule {}

@Injectable({ providedIn: 'root' })
export class TemplateEngineService {
    private platformId: Object;
    constructor() {
        this.platformId = 'server'; // Directly set the platform ID
      }

  async render(templateHtml: string, context: any = {}): Promise<string> {
    if (!isPlatformServer(this.platformId)) {
      throw new Error('Template rendering must be done on the server.');
    }
  
    // Use Angular Universal's renderModule
    const html = await renderModule(DynamicTemplateModule, { 
      document: `<app-template-root></app-template-root>`, 
      extraProviders: [
        { provide: TemplateRootComponent, useValue: { context } } 
      ]
    });

    return html;
  }
}