/**
 * @fileoverview A simple hello world component that demonstrates Angular Elements functionality.
 * 
 * This component demonstrates:
 * 1. How to create a simple Angular component that can be converted to a custom element
 * 2. How to emit events from the component that can be listened to in non-Angular environments
 * 3. How to interact with the MemberJunction framework from within a custom element
 */
import { Component, Output, EventEmitter } from '@angular/core';
import { Metadata } from '@memberjunction/core'
import { MJGlobal, MJEventType } from '@memberjunction/global'

/**
 * A simple Hello World component for MemberJunction that displays entity information.
 * 
 * This component demonstrates:
 * - Connecting to MemberJunction's Metadata system
 * - Emitting events that can be captured in standard JavaScript
 * - Displaying basic information about the MemberJunction entity system
 * 
 * When used as a web component, it's registered as <mj-hello-world>.
 */
@Component({
  standalone: false,
  templateUrl: './hello-mj.component.html',
  styleUrls: ['./hello-mj.component.css']
})
export class HelloMJComponent {
  /**
   * Tracks the number of entities loaded from MemberJunction's metadata
   */
  public entityCount: number = 0;
  
  /**
   * Event emitter that sends entity information to listeners
   * When used as a web component, this becomes a standard DOM event
   */
  @Output() display = new EventEmitter();
  
  constructor() {}

  /**
   * Loads and displays entity information from MemberJunction's metadata.
   * 
   * This method:
   * 1. Waits for the user to be logged in to MemberJunction
   * 2. Retrieves metadata about all entities
   * 3. Emits events with the entity information
   * 4. Updates the UI with the count of entities
   * 
   * The emitted event can be captured in standard JavaScript when this
   * component is used as a custom element.
   */
  async showInfo() {
    // First, we need to make sure we've logged in, so wait for that event
    MJGlobal.Instance.GetEventListener(true).subscribe((event) => {
      // This will fire off each time if we've already logged in, but if we've not yet, it will wait here until we do
      if (event.event === MJEventType.LoggedIn) {  
        // Emit a loading message
        this.display.emit('Loading Metadata...')
        
        // Get metadata from MemberJunction
        const md = new Metadata();
        // Create a string with all entity names
        const entityListString = md.Entities.map((e) => e.Name).join('\n');
        // Store the count for display in the template
        this.entityCount = md.Entities.length;
        
        // Emit the entity list to any listeners
        this.display.emit(entityListString);
    
        // Also raise a global MemberJunction event that other MJ components can listen for
        MJGlobal.Instance.RaiseEvent({
          component: this, 
          event: MJEventType.ComponentEvent, 
          eventCode: 'display', 
          args: entityListString
        });
      }
    });
  }

  // Commented out method - keeping for reference
  // EventListener(event: MJEventType) {
  //   console.log(event);
  // }
}
