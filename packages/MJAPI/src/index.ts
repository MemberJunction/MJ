import { pathToFileURL } from 'node:url';
import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';
import { LoadGeneratedEntities } from 'mj_generatedentities';
LoadGeneratedEntities();
import { LoadGeneratedActions } from 'mj_generatedactions';
LoadGeneratedActions();
import { LoadProvider } from '@memberjunction/communication-sendgrid';
LoadProvider();

import './auth/exampleNewUserSubClass'; // make sure this new class gets registered

const localPath = (p: string) => pathToFileURL(resolve(import.meta.dirname, p)).href;

const resolverPaths = [
  //  'resolvers/**/*Resolver.{js,ts}',
  'generated/generated.{js,ts}',
];

serve(resolverPaths.map(localPath));
