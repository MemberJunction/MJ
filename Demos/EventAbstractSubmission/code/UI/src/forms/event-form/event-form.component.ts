import { Component, ElementRef } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { EventEntity } from 'mj_generatedentities';

/**
 * Event Form Component - Placeholder
 * TODO: Implement with Angular Material components
 */
@Component({
  selector: 'mj-event-form',
  template: '<div>Event Form Component - To be implemented</div>',
  styles: ['div { padding: 20px; text-align: center; color: #666; }']
})
@RegisterClass(BaseFormComponent, 'Events')
export class EventFormComponent extends BaseFormComponent {

  public record!: EventEntity;

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
