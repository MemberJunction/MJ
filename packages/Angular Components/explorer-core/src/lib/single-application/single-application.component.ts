import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ApplicationEntityInfo, Metadata, RunView, EntityRecordNameInput } from '@memberjunction/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { SharedService } from '../shared/shared.service';

@Component({
  selector: 'app-single-application',
  templateUrl: './single-application.component.html',
  styleUrls: ['./single-application.component.css', '../shared/first-tab-styles.css']
})
export class SingleApplicationComponent implements OnInit {
  constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService) {

  }
  public appName: string = ''
  public appDescription: string = ''
  public appEntities: ApplicationEntityInfo[] = [];
  public appFavorites: UserFavoriteEntity[] = [];

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const appName = params.get('appName'); 
      // Perform any necessary actions with the ViewID, such as fetching data
      if (appName) {
        this.appName = appName;
        const md = new Metadata()
        const app = md.Applications.find(a => a.Name == appName)
        if (app)  {
          this.appDescription = app.Description
          this.appEntities = app.ApplicationEntities 
          const rv = new RunView();
          rv.RunView({
            EntityName: 'User Favorites',
            ExtraFilter: `UserID=${md.CurrentUser.ID} AND EntityID IN (${app.ApplicationEntities.map(ae => ae.EntityID).join(',')})`
          }).then(async (favorites: any) => {
            this.appFavorites = favorites.Results // set the result in the list and let the below happen after async and it will update via data binding when done

            const input: EntityRecordNameInput[] = favorites.Results.map((fav: any) => {
              return { EntityName: fav.Entity, PrimaryKeyValue: fav.RecordID }
            })
            const results = await md.GetEntityRecordNames(input)
            if (results)
              results.forEach((result) => {
                const fav = favorites.Results.find((f: any) => f.Entity === result.EntityName && f.RecordID === result.PrimaryKeyValue)
                if (fav) {
                  fav.RecordName = result.Success ? result.RecordName : fav.Entity + ' ' + fav.RecordID
                }
              });
          })
        }

      }
    });    
  }

  entityItemClick(info: ApplicationEntityInfo) {
    if (info) {
      const paramsArray = ['entity', info.Entity];
      this.router.navigate(paramsArray)  
    }
  }
  favoriteItemClick(fav: UserFavoriteEntity) {
    if (fav) {
      if (fav.Entity === 'User Views') {
        // opening a view, different route
        this.router.navigate(['resource', 'view', fav.RecordID]);
      }
      else {
        this.router.navigate(['resource', 'record', fav.RecordID], { queryParams: { Entity: fav.Entity } })
      }
    }
  }
  
}
