const fs = require('fs');

const files = [
    'packages/Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.html',
    'packages/Angular/Explorer/dashboards/src/AI/components/tags/tags-resource.component.html',
    'packages/Angular/Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.html',
    'packages/Angular/Generic/dashboard-viewer/src/lib/dashboard-browser/dashboard-browser.component.html',
    'packages/Angular/Generic/archive-manager/src/lib/archive-run-viewer/archive-run-viewer.component.html'
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');

    // Fix at-schedule-dialog-close
    content = content.replace(/<button class="at-schedule-dialog-close"(.*?)>/g, (match, p1) => {
        if (!p1.includes('aria-label')) {
            return `<button class="at-schedule-dialog-close"${p1} aria-label="Close">`;
        }
        return match;
    });

    // Fix at-slide-close without aria-label
    content = content.replace(/<button class="at-slide-close" \([^\)]+\)="CloseDrillDownTag\(\)"([^>]*)>/g, (match, p1) => {
         if (!p1.includes('aria-label')) {
             return match.replace('>', ' aria-label="Close">');
         }
         return match;
    });

    // Fix at-action-btn at-btn-xs (from previous commit)
    content = content.replace(/<button class="at-action-btn at-btn-xs" \(click\)="CloseDrawer\(\)" title="Close">/g, '<button class="at-action-btn at-btn-xs" (click)="CloseDrawer()" title="Close" aria-label="Close">');

    fs.writeFileSync(file, content, 'utf8');
}
