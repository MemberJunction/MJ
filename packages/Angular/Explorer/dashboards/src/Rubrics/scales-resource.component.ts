import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/** Thin nav shim for the scales list. */
@RegisterClass(BaseResourceComponent, 'RubricScalesResource')
@Component({
    standalone: false,
    selector: 'mj-rubric-scales-resource',
    template: `<mj-rubric-scales-dashboard></mj-rubric-scales-dashboard>`,
})
export class RubricScalesResourceComponent extends BaseResourceComponent implements OnInit {
    public override ngOnInit(): void {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    public override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Scales';
    }

    public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-sliders';
    }
}
