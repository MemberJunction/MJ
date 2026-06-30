/**
 * @fileoverview MCP Management Module
 *
 * Angular module for MCP (Model Context Protocol) server management.
 * Provides components for managing servers, connections, tools, and viewing logs.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';

// MJ UI Components
import {
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJDropdownComponent,
    MJNumericInputComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageBodyComponent,
    MJFilterPopoverComponent,
    MJFilterPanelComponent,
    MJFilterFieldComponent,
    MJPageSearchComponent,
    MJTabNavComponent,
    MJViewToggleComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
    MJEmptyStateComponent,
    MJAlertComponent,
    MJAccordionPanelComponent,
    MJAccordionTitleDirective,
    MJAccordionActionsDirective
} from '@memberjunction/ng-ui-components';

// MemberJunction Modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CredentialsModule } from '@memberjunction/ng-credentials';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';

// Shared Pipes Module
import { SharedPipesModule } from '../shared/shared-pipes.module';

// MCP Components
import { MCPDashboardComponent } from './mcp-dashboard.component';
import { MCPResourceComponent } from './mcp-resource.component';
import { MCPFilterPanelComponent } from './mcp-filter-panel.component';
import { MCPServerDialogComponent } from './components/mcp-server-dialog.component';
import { MCPConnectionDialogComponent } from './components/mcp-connection-dialog.component';
import { MCPTestToolDialogComponent } from './components/mcp-test-tool-dialog.component';
import { MCPLogDetailPanelComponent } from './components/mcp-log-detail-panel.component';

@NgModule({
    declarations: [
        MCPDashboardComponent,
        MCPResourceComponent,
        MCPFilterPanelComponent,
        MCPServerDialogComponent,
        MCPConnectionDialogComponent,
        MCPTestToolDialogComponent,
        MCPLogDetailPanelComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        ScrollingModule,
        MJButtonDirective,
        MJDialogComponent,
        MJDialogActionsComponent,
        MJDropdownComponent,
        MJNumericInputComponent,
        MJPageHeaderComponent,
        MJPageLayoutComponent,
        MJPageBodyComponent,
        MJFilterPopoverComponent,
        MJFilterPanelComponent,
        MJFilterFieldComponent,
        MJPageSearchComponent,
        MJTabNavComponent,
        MJViewToggleComponent,
        MJRefreshButtonComponent,
    MJStatBadgeComponent,
        MJEmptyStateComponent,
        MJAlertComponent,
        MJAccordionPanelComponent,
        MJAccordionTitleDirective,
        MJAccordionActionsDirective,
        SharedGenericModule,
        CredentialsModule,
        CodeEditorModule,
        SharedPipesModule
    ],
    exports: [
        MCPDashboardComponent,
        MCPResourceComponent,
        MCPFilterPanelComponent,
        MCPServerDialogComponent,
        MCPConnectionDialogComponent,
        MCPTestToolDialogComponent,
        MCPLogDetailPanelComponent
    ]
})
export class MCPModule { }
