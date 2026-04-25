/**
 * @fileoverview MCP Resource Component
 *
 * Resource wrapper for the MCP Dashboard that allows it to be used
 * as a nav item in applications (like the AI Application).
 */

import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseResourceComponent, 'MCPResource')
@Component({
    standalone: false,
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
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'MCP';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-plug-circle-bolt';
    }
}
