/**
 * @fileoverview Listener Demo component for demonstrating event listening in MemberJunction.
 * 
 * This component demonstrates:
 * 1. Subscribing to global MemberJunction events
 * 2. Handling events from other components
 * 3. Using input properties in a web component
 */
import { Component, OnInit, Input } from '@angular/core';
import { MJGlobal, MJEvent } from '@memberjunction/global'

/**
 * A component that demonstrates listening to MemberJunction global events.
 * 
 * Features:
 * - Listens to MemberJunction global events
 * - Logs event information to the console
 * - Can display information via an input property
 * 
 * When used as a web component, it's registered as <mj-listener-demo>.
 */
@Component({
  standalone: false,
  templateUrl: './listener-demo.component.html',
  styleUrls: ['./listener-demo.component.css']
})
export class MJListenerDemo implements OnInit {
  /**
   * A string to display in the component.
   * 
   * When used as a web component, this property can be set directly:
   * document.querySelector('mj-listener-demo').displayString = 'Hello!';
   */
  @Input() displayString: string = '';

  /**
   * Initializes the component and sets up the event listener.
   * 
   * Subscribes to MemberJunction's global event system and logs events
   * to the console. This demonstrates how components can communicate
   * through the event system.
   */
  async ngOnInit() {
    // Subscribe to MemberJunction global events
    MJGlobal.Instance.GetEventListener(true).subscribe((e: MJEvent) => {
      // Log the event arguments to the console
      console.log('MJListenerDemo: MJGlobal.RegisterEventListener: display: ', e.args);
      
      // Note: In a real-world application, you would process the event data
      // and update the component's state or UI accordingly
    });
  }
}
