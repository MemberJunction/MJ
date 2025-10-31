import { Component } from '@angular/core';
import { SpeakerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@Component({
  selector: 'mj-speaker-form',
  templateUrl: './speaker-form.component.html',
  styleUrls: ['../shared/form-styles.css']
})
@RegisterClass(BaseFormComponent, 'Speakers')
export class SpeakerFormComponent extends BaseFormComponent {
  public record!: SpeakerEntity;
}

export function LoadSpeakerFormComponent() {
  // Tree-shaking prevention
}
