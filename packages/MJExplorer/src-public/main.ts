import { StartPublicHost } from '@memberjunction/ng-public-host';
import { environment } from '../src/environments/environment';
import { PUBLIC_PAGES } from '../src/app/generated/public-pages.generated';

// The separate public build. The web host sends every /p/ address here instead of to Explorer.
StartPublicHost({ Environment: environment, PublicPages: PUBLIC_PAGES })
  .catch(error => console.error('The public page could not start.', error));
