/**
 * @fileoverview Entity List component for displaying MemberJunction entities.
 * 
 * This component demonstrates:
 * 1. Creating a more complex Angular component that can be converted to a web component
 * 2. Displaying a list of data from MemberJunction
 * 3. Handling user interactions and emitting events that can be captured outside Angular
 * 4. Managing Angular change detection when used as a custom element
 */
import { Component, Output, OnInit, EventEmitter } from '@angular/core';
import { EntityInfo, Metadata } from '@memberjunction/core';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { ChangeDetectorRef } from '@angular/core';

/**
 * A component that displays a list of MemberJunction entities.
 * 
 * Features:
 * - Displays a table of entities with their properties
 * - Handles row selection
 * - Emits events when rows are clicked
 * - Automatically loads entity metadata when the user is logged in
 * 
 * When used as a web component, it's registered as <mj-entity-list-demo>.
 */
@Component({
  standalone: false,
  selector: 'app-entity-list-demo',
  templateUrl: './entity-list-demo.component.html',
  styleUrls: ['./entity-list-demo.component.css']
})
export class EntityListDemoComponent implements OnInit {
  /**
   * Event emitter for row click events.
   * When used as a web component, this becomes a standard DOM event.
   * The event data contains the selected EntityInfo object.
   */
  @Output() rowClicked = new EventEmitter();

  /**
   * The list of entities loaded from MemberJunction's metadata
   */
  public entityList: EntityInfo[] = [];
  
  /**
   * The currently selected entity in the list
   */
  public selectedRow: EntityInfo;

  /**
   * @param cdr Angular's ChangeDetectorRef for manually triggering change detection
   *            This is needed when using the component as a web component
   */
  constructor(private cdr: ChangeDetectorRef) { }

  /**
   * Lifecycle hook that initializes the component.
   * 
   * Subscribes to MemberJunction's event system to load entities
   * once the user is logged in.
   */
  ngOnInit() {
    MJGlobal.Instance.GetEventListener(true).subscribe((event) => {
      // This will fire off each time if we've already logged in, but if we've not yet, it will wait here until we do
      if (event.event === MJEventType.LoggedIn) { 
        // Load entity metadata
        const md = new Metadata();
        this.entityList = md.Entities;
        
        // Need to manually trigger change detection when used as a web component
        // because we're operating outside Angular's change detection "Zone"
        this.cdr.detectChanges(); 
      }
    });
  }

  /**
   * Handles the click event on an entity row.
   * 
   * Sets the selected row and emits an event with the entity information
   * that can be captured by parent components or by standard JavaScript
   * when used as a web component.
   * 
   * @param entity The EntityInfo object for the clicked row
   */
  handleRowClicked(entity: EntityInfo) {
    // Update the selected row
    this.selectedRow = entity;
    
    // Emit the event with the entity data
    // This will become a standard DOM event when used as a web component
    this.rowClicked.emit(entity);
  }
}
