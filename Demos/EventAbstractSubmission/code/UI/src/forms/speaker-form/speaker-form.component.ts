import { Component, ElementRef } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { SpeakerEntity } from 'mj_generatedentities';

/**
 * Speaker Form Component - Placeholder
 * TODO: Implement with Angular Material components
 */
@Component({
  selector: 'mj-speaker-form',
  template: '<div>Speaker Form Component - To be implemented</div>',
  styles: ['div { padding: 20px; text-align: center; color: #666; }']
})
@RegisterClass(BaseFormComponent, 'Speakers')
export class SpeakerFormComponent extends BaseFormComponent {

  public record!: SpeakerEntity;

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }
}
