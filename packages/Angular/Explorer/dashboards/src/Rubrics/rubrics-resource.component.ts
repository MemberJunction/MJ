import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/** Thin nav shim. The catalog dashboard owns the page. */
@RegisterClass(BaseResourceComponent, 'RubricsResource')
@Component({
    standalone: false,
    selector: 'mj-rubrics-resource',
    template: `<mj-rubrics-dashboard></mj-rubrics-dashboard>`,
})
export class RubricsResourceComponent extends BaseResourceComponent implements OnInit {
    public override ngOnInit(): void {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    public override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Catalog';
    }

    public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-scale-balanced';
    }
}
