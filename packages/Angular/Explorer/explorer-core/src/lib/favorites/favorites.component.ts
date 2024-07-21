import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Metadata, RunView, EntityRecordNameInput, CompositeKey, EntityRecordNameResult, LogError } from '@memberjunction/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.css', '../../shared/first-tab-styles.css']
})
export class FavoritesComponent {
  public favorites: UserFavoriteEntity[] = [];
  public ExtraFilter: string = '';

  constructor(private router: Router) { }
  
  async ngOnInit() {
    const md = new Metadata();
    const rv = new RunView();
    let sFilter = `UserID='${md.CurrentUser.ID}'`;
    if (this.ExtraFilter){
      sFilter += `AND (${this.ExtraFilter})`
    }

    const viewResults = await rv.RunView({
      EntityName: 'User Favorites',
      ExtraFilter: sFilter
    });

    if(!viewResults.Success){
      LogError(viewResults.ErrorMessage);
      SharedService.Instance.CreateSimpleNotification("Unable to load User Favorites");
      return;
    }

    this.favorites = viewResults.Results // set the result in the list and let the below happen after async and it will update via data binding when done

    const input: EntityRecordNameInput[] = this.favorites.map(fav => {
      let compositeKey: CompositeKey = new CompositeKey([{ FieldName: 'ID', Value: fav.RecordID }]);
      return { EntityName: fav.Entity, CompositeKey: compositeKey }
    })
    const results: EntityRecordNameResult[] = await md.GetEntityRecordNames(input);
    if (results) {
      results.forEach((result) => {
        let compositeKey: CompositeKey = new CompositeKey(result.CompositeKey.KeyValuePairs);
        const fav = this.favorites.find(f => f.Entity == result.EntityName && f.RecordID == compositeKey.GetValueByIndex(0))
        if (fav) {
          // typecast fav to any so we can add the recordname into the object below
          (<any>fav).RecordName = result.Success ? result.RecordName : fav.Entity + ' ' + fav.RecordID
        }
      });
    }
  }

  favoriteItemClick(fav: UserFavoriteEntity) {
    if (fav) {
      if (fav.Entity === 'User Views') {
        // opening a view, different route
        this.router.navigate(['resource', 'view', fav.RecordID]);
      }
      else {
        // need to take the fav.RecordID and handle mapping it
        // Our URL format is /resource/record/{RecordID}?Entity={Entity}
        // but the {RecordID} part is more complicated. Since some entities have multi-valued keys we need to handle that
        // it is done by using the PIPE | character so the RecordID would be something like this ID|123 
        // in the situation where we have multiple keys, we would have ID1|123||ID2|456 and so on.
        // Get the entity info first to get the primary keys, then split the fav.RecordID that we have which will have a comma delimited list of values (no field names or pipes)
        // then we can map the values to the field names and create the query string for the route
        const splitRecordID = fav.RecordID.split(',')
        const md = new Metadata()
        const entityInfo = md.Entities.find(e => e.Name === fav.Entity)
        if (entityInfo) {
          let routeSegment = ''
          for (let i = 0; i < entityInfo.PrimaryKeys.length; i++) {
            if (i > 0) {
              routeSegment += '||'
            }
            routeSegment += entityInfo.PrimaryKeys[i].Name + '|' + splitRecordID[i]
          }
          this.router.navigate(['resource', 'record', routeSegment], { queryParams: { Entity: fav.Entity } })
        }
        else
          throw new Error(`Entity ${fav.Entity} not found in metadata`)
      }
    }
  }
  
  favoriteItemDisplayName(fav: any) {
    if (fav) {
      if (fav.RecordName) {
        return fav.RecordName 
      }  
      else {
        return fav.RecordID;
      }
    }
  }
}
