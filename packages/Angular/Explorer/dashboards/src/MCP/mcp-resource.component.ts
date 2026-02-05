/**
 * @fileoverview MCP Resource Component
 *
 * Resource wrapper for the MCP Dashboard that allows it to be used
 * as a nav item in applications (like the AI Application).
 *
 * @module MCP Resource
 */

import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

/**
 * MCP Resource Component
 *
 * Wrapper that hosts the MCP Dashboard for use in application nav items.
 * Registered as 'MCPResource' for use with ResourceType: "Custom" nav items.
 */
@RegisterClass(BaseResourceComponent, 'MCPResource')
@Component({
    selector: 'mj-mcp-resource',
    template: `
        <mj-mcp-dashboard></mj-mcp-dashboard>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
        }
    `]
})
export class MCPResourceComponent extends BaseResourceComponent implements OnInit {

    ngOnInit(): void {
        // Signal that the resource has finished loading
        // This is required for the shell's loading screen to dismiss
        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'MCP';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-plug-circle-bolt';
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadMCPResource(): void {
    // Ensures the component is not tree-shaken
}
