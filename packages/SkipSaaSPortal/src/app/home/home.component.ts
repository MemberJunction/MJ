import { Component, OnInit } from '@angular/core';
import { SharedService } from '../services/shared-service';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  public title: string = environment.APP_TITLE

  constructor(
    public sharedService: SharedService, 
    public router: Router
  ) {}

  async ngOnInit()  {
    if (this.sharedService.AccessDenied)
      this.router.navigate(['/no-access']);
    else {
      this.sharedService.setupComplete$.subscribe(async (complete: boolean) => {
        if (complete) {}
      });
    }
  }

  goToReportList() {
    this.router.navigate([`/report-list`]);
  }

  goToSkip() {
    this.router.navigate([`/chat/0`]);
  }
}
