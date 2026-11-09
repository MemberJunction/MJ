import { ComponentRef, Injectable, ViewContainerRef } from '@angular/core';
import { DashboardViewerComponent } from '@memberjunction/ng-dashboard-viewer';

/** Creates the dashboard viewer an editor shows. Tests provide a double. */
@Injectable({ providedIn: 'root' })
export class DashboardViewerFactory {
    /** Creates a viewer in `host`, the editor's view container for the dashboard body. */
    public Create(host: ViewContainerRef): ComponentRef<DashboardViewerComponent> {
        return host.createComponent(DashboardViewerComponent);
    }
}
