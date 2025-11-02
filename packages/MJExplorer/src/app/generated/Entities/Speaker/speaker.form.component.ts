import { Component } from '@angular/core';
import { SpeakerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSpeakerDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Speakers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-speaker-form',
    templateUrl: './speaker.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SpeakerFormComponent extends BaseFormComponent {
    public record!: SpeakerEntity;
} 

export function LoadSpeakerFormComponent() {
    LoadSpeakerDetailsComponent();
}
