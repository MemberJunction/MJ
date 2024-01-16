import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';
import { LoadGeneratedEntities } from 'mj_generatedentities';
LoadGeneratedEntities();

import './auth/exampleNewUserSubClass'; // make sure this new class gets registered

const localPath = (p: string) => resolve(__dirname, p);

const resolverPaths = [
//  'resolvers/**/*Resolver.{js,ts}',
  'generated/generated.{js,ts}'
]

serve(resolverPaths.map(localPath));