import { Component } from '@angular/core';
import { EventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEventDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Events') // Tell MemberJunction about this class
@Component({
    selector: 'gen-event-form',
    templateUrl: './event.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EventFormComponent extends BaseFormComponent {
    public record!: EventEntity;
} 

export function LoadEventFormComponent() {
    LoadEventDetailsComponent();
}
