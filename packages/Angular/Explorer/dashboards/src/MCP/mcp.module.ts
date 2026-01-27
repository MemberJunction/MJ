/**
 * @fileoverview MCP Management Module
 *
 * Angular module for MCP (Model Context Protocol) server management.
 * Provides components for managing servers, connections, tools, and viewing logs.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Kendo UI Modules
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogModule } from '@progress/kendo-angular-dialog';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';

// MemberJunction Modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// MCP Components
import { MCPDashboardComponent, LoadMCPDashboard } from './mcp-dashboard.component';
import { MCPServerDialogComponent, LoadMCPServerDialog } from './components/mcp-server-dialog.component';
import { MCPConnectionDialogComponent, LoadMCPConnectionDialog } from './components/mcp-connection-dialog.component';

@NgModule({
    declarations: [
        MCPDashboardComponent,
        MCPServerDialogComponent,
        MCPConnectionDialogComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        ButtonsModule,
        DialogModule,
        DropDownsModule,
        InputsModule,
        SharedGenericModule
    ],
    exports: [
        MCPDashboardComponent,
        MCPServerDialogComponent,
        MCPConnectionDialogComponent
    ]
})
export class MCPModule { }

/**
 * Loads all MCP components to prevent tree-shaking
 */
export function LoadMCPModule(): void {
    LoadMCPDashboard();
    LoadMCPServerDialog();
    LoadMCPConnectionDialog();
}
