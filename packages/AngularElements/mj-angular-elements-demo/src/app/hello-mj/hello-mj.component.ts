import { Component, Output, EventEmitter } from '@angular/core';
import { Metadata } from '@memberjunction/core'
import { MJGlobal, MJEventType } from '@memberjunction/global'

@Component({
  templateUrl: './hello-mj.component.html',
  styleUrls: ['./hello-mj.component.css']
})
export class HelloMJComponent {
  public entityCount: number = 0;
  @Output() display = new EventEmitter();
  
  constructor() {}

  async showInfo() {
    // first, we need to make sure we've logged in, so wait for that event
    MJGlobal.Instance.GetEventListener(true).subscribe((event) => {
      // this will fire off each time if we've already logged in, but if we've not yet, it will wait here until we do
      if (event.event === MJEventType.LoggedIn) {  
        this.display.emit('Loading Metadata...')
        const md = new Metadata();
        const entityListString = md.Entities.map((e) => e.Name).join('\n');
        this.entityCount = md.Entities.length;
        
        this.display.emit(entityListString);
    
        MJGlobal.Instance.RaiseEvent({component: this, event: MJEventType.ComponentEvent, eventCode: 'display', args: entityListString});
      }
    });
  }

  // EventListener(event: MJEventType) {
  //   console.log(event);
  // }
}
