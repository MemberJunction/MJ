import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { BaseEntity, CompositeKey, KeyValuePair, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent } from '@memberjunction/ng-shared';
import { DrillDownInfo } from '@memberjunction/ng-skip-chat';
 

/**
 * Simple wrapper component to handle generic Skip Chat component events and handle within MJ Explorer
 */
@Component({
  selector: 'mj-skip-chat-wrapper',
  templateUrl: './skip-chat-wrapper.component.html',
  styleUrls: ['./skip-chat-wrapper.component.css']
})
@RegisterClass(BaseNavigationComponent, 'Ask Skip')
export class SkipChatWrapperComponent {  
  constructor (private router: Router, private location: Location) {  }

  public NavigateToMatchingReport(reportId: string) {
    this.router.navigate(['resource', 'report', reportId]);
  }

  public ConversationSelected(conversationId: string) {
    this.location.go(`/askskip/${conversationId}`);
  }

  public async HandleDrillDownEvent(drillDownInfo: DrillDownInfo) {
    // get the matching record for the filter and if it has a single record, then get that pkey and use it for the final argument
    const filter = drillDownInfo.Filter;
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: drillDownInfo.EntityName,
      ExtraFilter: filter,
      ResultType: 'entity_object'
    })
    if (result && result.Success && result.Results.length === 1) {
      const record = result.Results[0];
      const ck = new CompositeKey(record.PrimaryKeys.map((pk) => {
        const kv = new KeyValuePair;
        kv.FieldName = pk.Name;
        kv.Value = record.Get(pk.Name);
        return kv;
      }));
      const urlSegment = ck.ToURLSegment();//ck.KeyValuePairs.length > 1 ? ck.ToURLSegment() : ck.KeyValuePairs[0].Value;
      const url = `/resource/record/${urlSegment}?Entity=${drillDownInfo.EntityName}`;
      this.router.navigateByUrl(url);
    }
  }
}
