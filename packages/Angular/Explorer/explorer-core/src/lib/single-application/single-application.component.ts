import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'
import { ApplicationEntityInfo, Metadata, RunView, EntityRecordNameInput, ApplicationInfo } from '@memberjunction/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-single-application',
  templateUrl: './single-application.component.html',
  styleUrls: ['./single-application.component.css', '../../shared/first-tab-styles.css']
})
export class SingleApplicationComponent implements OnInit {
  constructor (private router: Router, private route: ActivatedRoute, private sharedService: SharedService) {

  }
  public appName: string = ''
  public app: ApplicationInfo | undefined;
  public appDescription: string = ''
  public appEntities: ApplicationEntityInfo[] = [];

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (params) => {
      const appName = params.get('appName'); 
      // Perform any necessary actions with the ViewID, such as fetching data
      if (appName) {
        this.appName = appName;
        const md = new Metadata()
        this.app = md.Applications.find(a => a.Name == appName)
        if (this.app)  {
          this.appDescription = this.app.Description
          this.appEntities = this.app.ApplicationEntities 
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
