import { Component } from '@angular/core';
import { MJEntityUniqueKeyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Unique Keys') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityuniquekey-form',
    templateUrl: './mjentityuniquekey.form.component.html'
})
export class MJEntityUniqueKeyFormComponent extends BaseFormComponent {
    public record!: MJEntityUniqueKeyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

