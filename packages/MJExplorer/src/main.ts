import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

async function initAndBootstrap() {
  platformBrowserDynamic().bootstrapModule(AppModule)
    .then(ref => {
      //LogStatus('Bootstrap success: ' + ref);
    })
    .catch(err => console.error(err));
}

initAndBootstrap();
