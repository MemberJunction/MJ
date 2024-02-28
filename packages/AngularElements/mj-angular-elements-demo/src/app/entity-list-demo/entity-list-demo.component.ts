import { Component, Output, OnInit, EventEmitter } from '@angular/core';
import { EntityInfo, Metadata } from '@memberjunction/core';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-entity-list-demo',
  templateUrl: './entity-list-demo.component.html',
  styleUrls: ['./entity-list-demo.component.css']
})
export class EntityListDemoComponent implements OnInit {
  @Output() rowClicked = new EventEmitter();

  public entityList: EntityInfo[] = [];
  public selectedRow: EntityInfo;

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    MJGlobal.Instance.GetEventListener(true).subscribe((event) => {
      // this will fire off each time if we've already logged in, but if we've not yet, it will wait here until we do
      if (event.event === MJEventType.LoggedIn) { 
        const md = new Metadata();
        this.entityList = md.Entities;
        this.cdr.detectChanges(); // need to do this manually due to operating outside of Angular as an element so we're out side of Angular's change detection "Zone"
      }
    });
  }

  handleRowClicked(entity: EntityInfo) {
    // bubble up the event from our internal event to the rowClicked() event
    this.selectedRow = entity;
    this.rowClicked.emit(entity);
  }
}
