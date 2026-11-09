import { Component } from '@angular/core';
import { MJBrandKitAssetEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Brand Kit Assets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbrandkitasset-form',
    templateUrl: './mjbrandkitasset.form.component.html'
})
export class MJBrandKitAssetFormComponent extends BaseFormComponent {
    public record!: MJBrandKitAssetEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

