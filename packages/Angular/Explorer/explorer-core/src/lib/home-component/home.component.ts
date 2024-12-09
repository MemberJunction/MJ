import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { flyway_schema_historyEntityType } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Home')
export class HomeComponent extends BaseNavigationComponent {

  public versionString: string;

  constructor(public sharedService: SharedService, private router: Router) { 
    super();
    this.versionString = "";
    this.getVersionString().then(version => {
      this.versionString = version;
    });
  }

  public md = new Metadata();
  public HomeItems = this.md.VisibleExplorerNavigationItems.filter(item => item.ShowInHomeScreen); // only want to show the home items here

  public navigate(route: string) {
    this.router.navigate([route]).catch(err => {
      console.error('Navigation error:', err);
    });


  }

  private async getVersionString(): Promise<string> {
    const rv: RunView = new RunView();
    const md: Metadata = new Metadata();

    const entityInfo = md.EntityByID("5BF75308-AA1F-4F6D-AFA3-8E8603F97DC7");
    if(!entityInfo){
        LogError("Error getting entity info for entity with id", undefined, "5BF75308-AA1F-4F6D-AFA3-8E8603F97DC7");
        return "";
    }

    const rvResult = await rv.RunView<flyway_schema_historyEntityType>({
        EntityName: 'flyway _schema _histories',
        OrderBy: "installed_on desc"
    });

    if(!rvResult.Success){
        LogError("Error getting version string", undefined, rvResult.ErrorMessage);
        return "";
    }

    const latestSchema = rvResult.Results[0];
    let description: string | undefined = latestSchema.description;
    if(description){
        if(description[0] === 'v'){
            description = description.substring(1);
        }

        let index: number = 0;
        for(const char of description){
            //if it is a number or a dot, keep going
            if(char === '.' || (char >= '0' && char <= '9')){
                index++;
            }
            else{
              if(description[index - 1] === '.'){
                index--;
              }
              break;
            }
        }

        return `Version ${description.substring(0, index)}`;
    }
    else{
        return `Version ${latestSchema.version}`;
    }
  }
}
