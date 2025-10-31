import { Component } from '@angular/core';
import { EventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@Component({
  selector: 'mj-event-form',
  templateUrl: './event-form.component.html',
  styleUrls: ['../shared/form-styles.css']
})
@RegisterClass(BaseFormComponent, 'Events')
export class EventFormComponent extends BaseFormComponent {
  public record!: EventEntity;
}

export function LoadEventFormComponent() {
  // Tree-shaking prevention
}
