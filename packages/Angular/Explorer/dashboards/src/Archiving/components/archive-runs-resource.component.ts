/**
 * @fileoverview Archive Runs Resource Component
 *
 * Dashboard resource wrapper for the "Run History" tab in the Archiving application.
 * Delegates all rendering to the reusable mj-archive-run-viewer component from
 * @memberjunction/ng-archive-manager.
 */

import { Component, AfterViewInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'ArchiveRunsResource')
@Component({
    standalone: false,
    selector: 'app-archive-runs-resource',
    template: `
        <mj-page-layout>
            <mj-page-header
                Title="Archive Run History"
                Icon="fa-solid fa-clock-rotate-left"
                Subtitle="Execution history and results for archive jobs">
            </mj-page-header>
            <mj-page-body [Flex]="true" [Padding]="false">
                <mj-archive-run-viewer></mj-archive-run-viewer>
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [`:host { display: block; height: 100%; width: 100%; }`],
})
export class ArchiveRunsResourceComponent extends BaseResourceComponent implements AfterViewInit {
    ngAfterViewInit(): void {
        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Archive Run History';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-clock-rotate-left';
    }
}

export function LoadArchiveRunsResource() {
    // Prevents tree-shaking
}
