import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Workflows resource — thin shim. The inner dashboard owns its own `<mj-page-layout>` +
 * `<mj-page-header>` chrome, matching every other Explorer app's shape.
 */
@RegisterClass(BaseResourceComponent, 'WorkflowsResource')
@Component({
    standalone: false,
    selector: 'mj-workflows-resource',
    template: `<mj-workflows-dashboard></mj-workflows-dashboard>`,
})
export class WorkflowsResourceComponent extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Workflows';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-diagram-project';
    }
}
