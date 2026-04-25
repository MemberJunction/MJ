/**
 * @fileoverview Archive Configuration Resource Component
 *
 * Dashboard resource wrapper for the "Configuration" tab in the Archiving application.
 * Delegates all rendering to the reusable mj-archive-config-admin component from
 * @memberjunction/ng-archive-manager.
 */

import { Component, AfterViewInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'ArchiveConfigResource')
@Component({
    standalone: false,
    selector: 'app-archive-config-resource',
    template: `<mj-archive-config-admin></mj-archive-config-admin>`,
    styles: [`:host { display: block; height: 100%; width: 100%; overflow: auto; }`],
})
export class ArchiveConfigResourceComponent extends BaseResourceComponent implements AfterViewInit {
    ngAfterViewInit(): void {
        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Archive Configuration';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-sliders';
    }
}

export function LoadArchiveConfigResource() {
    // Prevents tree-shaking
}
