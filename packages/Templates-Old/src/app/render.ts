import 'zone.js/node';
import 'reflect-metadata';
import { renderModule } from '@angular/platform-server';
import { AppServerModule } from './app.server.module';

// import { join } from 'path';
// import { readFileSync } from 'fs';

const template = '<app-root></app-root>'; // Simplified template without any file

export async function renderAngularComponent(context: any): Promise<string> {
  return renderModule(AppServerModule, {
    document: template,
    url: '/',
    extraProviders: [
      { provide: 'context', useValue: context },
    ],
  });
}
