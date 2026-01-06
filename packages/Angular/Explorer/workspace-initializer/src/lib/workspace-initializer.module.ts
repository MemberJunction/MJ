/**
 * Workspace Initializer Module
 *
 * Provides WorkspaceInitializerService for reusable workspace initialization logic
 * across all MemberJunction applications.
 */

import { NgModule } from '@angular/core';
import { WorkspaceInitializerService } from './services/workspace-initializer.service';

@NgModule({
  providers: [
    WorkspaceInitializerService
  ]
})
export class WorkspaceInitializerModule {}
