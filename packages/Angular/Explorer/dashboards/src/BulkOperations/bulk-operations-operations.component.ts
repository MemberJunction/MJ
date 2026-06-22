import { Component, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

/**
 * "Operations" sub-page of the Bulk Operations shell. A thin host that renders the generic, self-contained
 * `<mj-record-process-studio>` (list / create / edit / run) scoped to the current provider.
 */
@RegisterClass(BaseResourceComponent, 'BulkOperationsOperations')
@Component({
    standalone: false,
    selector: 'mj-bulk-operations-operations',
    template: `<div class="bo-host"><mj-record-process-studio [Provider]="ProviderToUse"></mj-record-process-studio></div>`,
    styles: [`.bo-host{padding:20px;height:100%;overflow:auto;box-sizing:border-box}`],
})
export class BulkOperationsOperationsComponent extends BaseResourceComponent implements OnInit {
    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }
    override async GetResourceDisplayName(_data: ResourceData): Promise<string> { return 'Operations'; }
    override async GetResourceIconClass(_data: ResourceData): Promise<string> { return 'fa-solid fa-wand-magic-sparkles'; }
}
