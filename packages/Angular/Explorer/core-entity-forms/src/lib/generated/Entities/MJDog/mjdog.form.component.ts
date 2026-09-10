import { Component } from '@angular/core';
import { MJDogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dogs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdog-form',
    templateUrl: './mjdog.form.component.html'
})
export class MJDogFormComponent extends BaseFormComponent {
    public record!: MJDogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dogBehavioralProfile', sectionName: 'Dog Behavioral Profile', isExpanded: true },
            { sectionKey: 'animalDetails', sectionName: 'Animal Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

