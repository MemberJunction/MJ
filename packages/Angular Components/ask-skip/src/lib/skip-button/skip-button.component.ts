import { Component, Input } from '@angular/core';
import { FlexibleConnectedPositionStrategy, Overlay, OverlayConfig } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { SkipWindowComponent } from '../skip-window/skip-window.component';


@Component({
  selector: 'mj-skip-button',
  templateUrl: './skip-button.component.html',
  styleUrls: ['./skip-button.component.css']
})
export class SkipButtonComponent  {  
  constructor(private overlay: Overlay) {}

  public OpenSkipWindow() {
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
