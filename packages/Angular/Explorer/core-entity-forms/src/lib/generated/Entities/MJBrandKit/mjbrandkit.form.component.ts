import { Component } from '@angular/core';
import { MJBrandKitEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Brand Kits') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbrandkit-form',
    templateUrl: './mjbrandkit.form.component.html'
})
export class MJBrandKitFormComponent extends BaseFormComponent {
    public record!: MJBrandKitEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBrandKitAssets', sectionName: 'Brand Kit Assets', isExpanded: false }
        ]);
    }
}

