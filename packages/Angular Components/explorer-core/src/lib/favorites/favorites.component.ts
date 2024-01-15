import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Metadata, RunView, EntityRecordNameInput } from '@memberjunction/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.css', './../shared/first-tab-styles.css']
})
export class FavoritesComponent {
  public favorites: UserFavoriteEntity[] = [];
  public ExtraFilter: string = '';

  constructor(private router: Router) { }
  
  ngOnInit() {
    const md = new Metadata();
    const rv = new RunView();
    let sFilter = `UserID=${md.CurrentUser.ID}`
    if (this.ExtraFilter)
      sFilter += `AND (${this.ExtraFilter})`

    rv.RunView({
      EntityName: 'User Favorites',
      ExtraFilter: sFilter
    }).then(async (favorites: any) => {
      this.favorites = favorites.Results // set the result in the list and let the below happen after async and it will update via data binding when done

      const input: EntityRecordNameInput[] = favorites.Results.map((fav: any) => {
        return { EntityName: fav.Entity, PrimaryKeyValue: fav.RecordID }
      })
      const results = await md.GetEntityRecordNames(input)
      if (results)
        results.forEach((result) => {
          const fav = favorites.Results.find((f: any) => f.Entity == result.EntityName && f.RecordID == result.PrimaryKeyValue)
          if (fav) {
            fav.RecordName = result.Success ? result.RecordName : fav.Entity + ' ' + fav.RecordID
          }
        });
    })
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
