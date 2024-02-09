import { Component } from '@angular/core';
import { ContactLevelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadContactLevelDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Contact Levels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactlevel-form',
    templateUrl: './contactlevel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactLevelFormComponent extends BaseFormComponent {
    public record!: ContactLevelEntity;
} 

export function LoadContactLevelFormComponent() {
    LoadContactLevelDetailsComponent();
}
