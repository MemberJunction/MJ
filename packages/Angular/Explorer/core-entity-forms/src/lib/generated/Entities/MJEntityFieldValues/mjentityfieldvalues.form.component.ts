import { Component } from '@angular/core';
import { MJEntityFieldValuesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Field Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityfieldvalues-form',
    templateUrl: './mjentityfieldvalues.form.component.html'
})
export class MJEntityFieldValuesFormComponent extends BaseFormComponent {
    public record!: MJEntityFieldValuesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityAssociation', sectionName: 'Entity Association', isExpanded: true },
            { sectionKey: 'lookupDefinition', sectionName: 'Lookup Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

