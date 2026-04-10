import { Component } from '@angular/core';
import { MJTestGeoCompositeKeyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Geo Composite Keys') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestgeocompositekey-form',
    templateUrl: './mjtestgeocompositekey.form.component.html'
})
export class MJTestGeoCompositeKeyFormComponent extends BaseFormComponent {
    public record!: MJTestGeoCompositeKeyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

