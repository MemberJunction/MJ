import { fileURLToPath } from 'node:url';
import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';
import { LoadGeneratedEntities } from 'mj_generatedentities';
LoadGeneratedEntities();
import { LoadGeneratedActions } from 'mj_generatedactions';
LoadGeneratedActions();
import { LoadProvider } from '@memberjunction/communication-sendgrid';
LoadProvider();

//import './auth/exampleNewUserSubClass'; // make sure this new class gets registered

const localPath = (p: string) => {
  // Convert import.meta.url to a local directory path
  const dirname = fileURLToPath(new URL('.', import.meta.url));
  // Resolve the provided path relative to the derived directory path
  const resolvedPath = resolve(dirname, p);
  return resolvedPath;
};

const resolverPaths = [
  //  'resolvers/**/*Resolver.{js,ts}',
  'generated/generated.{js,ts}',
];

serve(resolverPaths.map(localPath))
  .then(() => {})
  .catch((e: unknown) => {
    const errorString: string = JSON.stringify(e, null, 4);
    console.error('Error starting MJAPI server:');
    console.error(errorString);
    console.error(e);
  });
