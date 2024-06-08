import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';
import { LoadGeneratedEntities } from 'mj_generatedentities';
LoadGeneratedEntities();
// import { LoadGeneratedActions } from 'mj_generatedactions';
// LoadGeneratedActions();
// import { LoadProvider } from '@memberjunction/communication-sendgrid';
// LoadProvider();

// import { AppServerComponent } from '@memberjunction/templates';

// AppServerComponent.onReady().subscribe(async () => {
//   console.log('AppServerComponent is ready');

//   const dataObject = {
//     FirstName: 'Jane',
//     LastName: 'Doe',
//     Title: 'President',
//     Address: '123 Main St.',
//     City: 'Anytown',
//     State: 'CA',
//     Country: 'USA',
//     Phone: '555-1212',
//   };

//   // Perform actions that depend on the component being ready
//   const startTime = new Date().getTime();
//   const result = await AppServerComponent.Instance.render('B', dataObject);
//   const endTime = new Date().getTime();
//   console.log(result, (endTime - startTime) / 1000 + ' seconds');
// });

import './auth/exampleNewUserSubClass'; // make sure this new class gets registered

const localPath = (p: string) => resolve(__dirname, p);

const resolverPaths = [
//  'resolvers/**/*Resolver.{js,ts}',
  'generated/generated.{js,ts}'
]

serve(resolverPaths.map(localPath));