import { Component } from '@angular/core';
import { MJAnimalEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Animals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjanimal-form',
    templateUrl: './mjanimal.form.component.html'
})
export class MJAnimalFormComponent extends BaseFormComponent {
    public record!: MJAnimalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'animalIdentity', sectionName: 'Animal Identity', isExpanded: true },
            { sectionKey: 'shelterHistory', sectionName: 'Shelter History', isExpanded: true },
            { sectionKey: 'physicalAttributes', sectionName: 'Physical Attributes', isExpanded: true },
            { sectionKey: 'animalProfile', sectionName: 'Animal Profile', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

