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
    template: `<mj-archive-run-viewer></mj-archive-run-viewer>`,
    styles: [`:host { display: block; height: 100%; width: 100%; overflow: auto; }`],
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
