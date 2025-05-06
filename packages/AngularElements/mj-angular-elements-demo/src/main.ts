/**
 * Main entry point for the Angular Elements demo application.
 * 
 * This file bootstraps the Angular application using the AppModule.
 * When the application is built for production with Angular Elements,
 * the output will be bundled into a single JavaScript file that can
 * be used in any HTML page.
 * 
 * @see AppModule for the component registration and custom element definitions.
 */
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

// Bootstrap the Angular application
platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error('Error bootstrapping the application:', err));
