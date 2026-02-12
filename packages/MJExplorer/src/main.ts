import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import './app/generated/open-app-bootstrap.generated';

async function initAndBootstrap() {
  platformBrowserDynamic().bootstrapModule(AppModule)
    .then(ref => {
      //LogStatus('Bootstrap success: ' + ref);
    })
    .catch(err => console.error(err));
}

initAndBootstrap();
