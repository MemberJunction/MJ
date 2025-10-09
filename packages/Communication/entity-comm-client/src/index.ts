// PUBLIC API SURFACE AREA
export * from './client';

// Automatically load the EntityCommunicationsEngineClient to prevent tree-shaking
import { LoadEntityCommunicationsEngineClient } from './client';
LoadEntityCommunicationsEngineClient();