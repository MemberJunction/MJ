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
  public loading: boolean = false;

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (params) => {
      const appName = params.get('appName'); 
      // Perform any necessary actions with the ViewID, such as fetching data
      if (appName) {
        this.appName = appName;
        this.loading = true;
        const md = new Metadata();
        
        // First check if applications are loaded
        if (md.Applications && md.Applications.length > 0) {
          this.findApplication(md, appName);
          this.loading = false;
        } else {
          // If not loaded, wait for metadata to be loaded
          // This can happen when navigating directly to the URL
          try {
            // Get and cache the metadata dataset to ensure applications are loaded
            const dataset = await md.GetAndCacheDatasetByName('MJ_Metadata');
            if (dataset && dataset.Success) {
              // Now try to find the application again
              this.findApplication(md, appName);
            } else {
              console.error('Failed to load metadata dataset');
            }
          } catch (error) {
            console.error('Error loading metadata:', error);
          } finally {
            this.loading = false;
          }
        }
      }
    });    
  }
  
  private findApplication(md: Metadata, appName: string): void {
    // Find the application - case insensitive comparison
    this.app = md.Applications.find(a => a.Name.toLowerCase() === appName.toLowerCase());
    if (this.app) {
      this.appDescription = this.app.Description;
      this.appEntities = this.app.ApplicationEntities;
    } else {
      console.warn(`Application '${appName}' not found in metadata. Available applications:`, md.Applications.map(a => a.Name));
    }
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
