import { Component } from '@angular/core';
import { bettyInstanceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Instances') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-bettyinstance-form',
    templateUrl: './bettyinstance.form.component.html'
})
export class bettyInstanceFormComponent extends BaseFormComponent {
    public record!: bettyInstanceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'promptComponents', sectionName: 'Prompt Components', isExpanded: false }
        ]);
    }
}

