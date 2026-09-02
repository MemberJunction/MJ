import { Component } from '@angular/core';
import { MJBreedEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Breeds') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbreed-form',
    templateUrl: './mjbreed.form.component.html'
})
export class MJBreedFormComponent extends BaseFormComponent {
    public record!: MJBreedEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'breedInformation', sectionName: 'Breed Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAnimals', sectionName: 'Animals', isExpanded: false }
        ]);
    }
}

