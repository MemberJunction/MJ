import { Component, OnInit } from '@angular/core';
import { EntityInfo, Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-entity-list',
  templateUrl: './entity-list.component.html',
  styleUrl: './entity-list.component.css'
})
export class EntityListComponent implements OnInit {
  Entities: EntityInfo[] = [];

  constructor() {}
  
  ngOnInit(): void {
    // Get the list of all non-MemberJunction managed entities
    const md = new Metadata();
    this.Entities = md.Entities.filter(e => e.SchemaName !== '__mj');
  }

}
