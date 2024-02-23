import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FlexibleConnectedPositionStrategy, Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Router } from '@angular/router';

import { SkipWindowComponent } from '../skip-window/skip-window.component';

export class SkipClickedEvent {
  public cancel: boolean = false;
}

@Component({
  selector: 'mj-skip-button',
  templateUrl: './skip-button.component.html',
  styleUrls: ['./skip-button.component.css']
})
export class SkipButtonComponent implements OnInit {  
  @Input() action: 'route' | 'window' = 'window';
  @Output() click: EventEmitter<any> = new EventEmitter();
  constructor(private overlay: Overlay, private router: Router) {}

  public isVisible: boolean = true;

  ngOnInit() {
    // Listen to route changes
    this.router.events.subscribe((event) => {
      // Check if the current route starts with /askskip
      this.isVisible = !this.router.url.startsWith('/askskip');
    });
  }

  public OpenSkipWindow() {
    const eventInfo: SkipClickedEvent = new SkipClickedEvent();
    eventInfo.cancel = false;
    this.click.emit(eventInfo);
    if(eventInfo.cancel){
      return;
    }

    // now check our action
    if (this.action === 'route') {
      this.RouteToSkip();
    }
    else {
      // get here that means the event was not cancelled
      const positionStrategy: FlexibleConnectedPositionStrategy = this.overlay.position().flexibleConnectedTo(document.body).withPositions([{
          originX: 'end',
          originY: 'top',
          overlayX: 'end',
          overlayY: 'top',
      }]);
      const overlayRef = this.overlay.create({
        hasBackdrop: true, // Optional: creates a backdrop behind the overlay
        backdropClass: 'custom-backdrop-class', // Optional: you can style the backdrop
        positionStrategy: positionStrategy
      });

      // Attaches the SkipWindowComponent to the overlay
      const componentPortal = new ComponentPortal(SkipWindowComponent);
      overlayRef.attach(componentPortal);

      // Optional: Close the overlay when the backdrop is clicked
      overlayRef.backdropClick().subscribe(() => overlayRef.dispose());
    }
  }

  private RouteToSkip() {
    this.router.navigate(['askskip'])
  }
}
