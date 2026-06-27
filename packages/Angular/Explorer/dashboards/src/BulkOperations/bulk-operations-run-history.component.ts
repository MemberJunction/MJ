import { Component, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

/**
 * "Run History" sub-page of the Bulk Operations shell. A thin host that renders the generic, self-contained
 * `<mj-record-process-history>` (run list + per-record drill-in) scoped to the current provider.
 */
@RegisterClass(BaseResourceComponent, 'BulkOperationsRunHistory')
@Component({
    standalone: false,
    selector: 'mj-bulk-operations-run-history',
    template: `<div class="bo-host"><mj-record-process-history [Provider]="ProviderToUse"></mj-record-process-history></div>`,
    styles: [`.bo-host{padding:20px;height:100%;overflow:auto;box-sizing:border-box}`],
})
export class BulkOperationsRunHistoryComponent extends BaseResourceComponent implements OnInit {
    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }
    override async GetResourceDisplayName(_data: ResourceData): Promise<string> { return 'Run History'; }
    override async GetResourceIconClass(_data: ResourceData): Promise<string> { return 'fa-solid fa-clock-rotate-left'; }
}
