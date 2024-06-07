import { bootstrapApplication } from '@angular/platform-browser';
import { config } from './app/app.config.server';
import { AppServerComponent } from './app/app.server.component';
import { CONTEXT, DynamicTemplateModuleBase, TemplateEngineService } from './app/templates';
import { MJGlobal } from '@memberjunction/global';
import { renderModule } from '@angular/platform-server';

const bootstrap = () => bootstrapApplication(AppServerComponent, config);

export default bootstrap;


AppServerComponent.onReady().subscribe(async () => {
  console.log('AppServerComponent is ready');

  const dataObject = {
    FirstName: 'Jane',
    LastName: 'Doe',
    Title: 'President',
    Address: '123 Main St.',
    City: 'Anytown',
    State: 'CA',
    Country: 'USA',
    Phone: '555-1212',
  };

  // Perform actions that depend on the component being ready
  const startTime = new Date().getTime();
  const result = await AppServerComponent.Instance.render('B', dataObject);
  const endTime = new Date().getTime();
  console.log(result, (endTime - startTime) / 1000 + ' seconds');
});