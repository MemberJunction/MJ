import { Component } from '@angular/core';
import { MJCatEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Cats') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcat-form',
    templateUrl: './mjcat.form.component.html'
})
export class MJCatFormComponent extends BaseFormComponent {
    public record!: MJCatEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'felineBehavioralTraits', sectionName: 'Feline Behavioral Traits', isExpanded: true },
            { sectionKey: 'animalDetails', sectionName: 'Animal Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

