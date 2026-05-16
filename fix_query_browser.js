const fs = require('fs');

const file = 'packages/Angular/Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.html';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/<button class="query-drawer-close" \(click\)="CloseDrawer\(\)" title="Close">/, '<button class="query-drawer-close" (click)="CloseDrawer()" title="Close" aria-label="Close">');

fs.writeFileSync(file, content, 'utf8');
