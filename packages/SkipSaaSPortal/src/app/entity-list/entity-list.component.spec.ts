import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntityListComponent } from './entity-list.component';

describe('EntityListComponent', () => {
  let component: EntityListComponent;
  let fixture: ComponentFixture<EntityListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntityListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EntityListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
