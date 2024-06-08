import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';
import { MJGlobal } from '@memberjunction/global';
import { CONTEXT, DynamicTemplateModuleBase } from './src/app/templates';
import { renderModule } from '@angular/platform-server';
import { AppServerComponent } from './src/app/app.server.component';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);
 
  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser
  server.get('**', express.static(browserDistFolder, {
    maxAge: '1y',
    index: 'index.html',
  }));
  console.log('here 0.0.0')

  // All regular routes use the Angular engine
  server.get('**', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    



    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => {

        
        res.send(html)

      })
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
    //test();
  });
}

run();

console.log('here 0')
    const dataObject = {
      FirstName: 'John',
      LastName: 'Doe',
      Title: 'President',
      Address: '123 Main St.',
      City: 'Anytown',
      State: 'CA',
      Country: 'USA',
      Phone: '555-1212',
    };
AppServerComponent.onReady().subscribe(async () => {
  console.log('AppServerComponent is ready');
  // Perform actions that depend on the component being ready
  const startTime = new Date().getTime();
  const result = await AppServerComponent.Instance.render('A', dataObject);
  const endTime = new Date().getTime();
  console.log(result, (endTime - startTime) / 1000 + ' seconds');
});

// console.log('here 0')

// let counter: number = 0;
// function test() {
//     if (0 === counter) {
//       counter++;
//         console.log('here 1')
//         const dataObject = {
//         FirstName: 'John',
//         LastName: 'Doe',
//         Title: 'President',
//         Address: '123 Main St.',
//         City: 'Anytown',
//         State: 'CA',
//         Country: 'USA',
//         Phone: '555-1212',
//       };
//       console.log('here 2')

//       const result = render('A', dataObject);
//       console.log(result); 
//       const result2 = render('B', dataObject);
//       console.log(result2); 
//     }
// }

// async function render(templateName: string, context: any = {}): Promise<string> {
//     const moduleRegistration = MJGlobal.Instance.ClassFactory.GetRegistration(DynamicTemplateModuleBase, templateName);
//     if (!moduleRegistration) {
//         throw new Error('Template not found!');
//     } 

//     const documentTemplate = `<app-dynamic-template-${templateName} [context]="context"></app-dynamic-template-${templateName}>`; 
//     console.log('documentTemplate', documentTemplate)
//     const html = await renderModule(moduleRegistration.SubClass, { 
//         document: documentTemplate, 
//         extraProviders: [  
//             {  
//                 provide: CONTEXT, 
//                 useValue: context  
//             }
//         ]
//     });

//     return html;    
// } 