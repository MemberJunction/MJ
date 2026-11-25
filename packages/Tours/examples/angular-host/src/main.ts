import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { DemoAngularTourAppComponent } from './demo-app.component';

export function BootstrapDemoAngularHost(): Promise<unknown> {
  return bootstrapApplication(DemoAngularTourAppComponent, {
    providers: [provideZonelessChangeDetection()],
  });
}
