import { Component } from '@angular/core';
import { ReplySeedEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReplySeedDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Reply Seeds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-replyseed-form',
    templateUrl: './replyseed.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReplySeedFormComponent extends BaseFormComponent {
    public record!: ReplySeedEntity;
} 

export function LoadReplySeedFormComponent() {
    LoadReplySeedDetailsComponent();
}
