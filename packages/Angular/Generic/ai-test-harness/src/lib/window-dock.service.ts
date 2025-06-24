import { Injectable, Component, ComponentRef, ApplicationRef, Injector, createComponent } from '@angular/core';

export interface DockItem {
    windowId: string;
    title: string;
    icon?: string;
    iconUrl?: string;
    restoreCallback: () => void;
    progress?: number; // 0-100 for progress indicator
}

@Component({
    selector: 'mj-window-dock',
    standalone: true,
    imports: [],
    template: `
        <div class="window-dock">
            @for (item of dockItems; track item.windowId) {
                <div class="dock-item" 
                     [title]="item.title"
                     (click)="restoreWindow(item)">
                    <i [class]="item.icon"></i>
                    <span class="dock-item-label">{{ getTruncatedTitle(item.title) }}</span>
                </div>
            }
        </div>
    `,
    styles: [`
        :host {
            position: fixed;
            bottom: 10px;
            right: 10px;
            z-index: 10001;
        }
        
        .window-dock {
            display: flex;
            gap: 12px;
            background: #f0f4f8;
            border: 1px solid #d0d8e0;
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .dock-item {
            width: 64px;
            height: 72px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s;
            padding: 8px 4px;
            
            &:hover {
                background-color: rgba(255, 255, 255, 0.8);
                transform: translateY(-2px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            
            i {
                font-size: 28px;
                color: #2c5282;
            }
            
            .dock-item-label {
                font-size: 11px;
                color: #4a5568;
                text-align: center;
                line-height: 1.2;
                max-width: 60px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .dock-item-progress {
                position: absolute;
                bottom: 2px;
                left: 2px;
                right: 2px;
                height: 3px;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 2px;
                overflow: hidden;
            }
            
            .dock-item-progress-bar {
                height: 100%;
                background: #0076B6; /* MJ blue color */
                transition: width 0.3s ease;
            }
            
            /* Pulse animation for indeterminate progress (50%) */
            .dock-item-progress-bar[style*="width: 50%"] {
                animation: pulse-progress 1.5s ease-in-out infinite;
            }
        }
        
        @keyframes pulse-progress {
            0% { opacity: 0.6; width: 30%; }
            50% { opacity: 1; width: 70%; }
            100% { opacity: 0.6; width: 30%; }
        }
    `]
})
export class WindowDockComponent {
    dockItems: DockItem[] = [];
    
    addItem(item: DockItem) {
        this.dockItems.push(item);
    }
    
    removeItem(windowId: string) {
        this.dockItems = this.dockItems.filter(item => item.windowId !== windowId);
    }
    
    restoreWindow(item: DockItem) {
        item.restoreCallback();
        this.removeItem(item.windowId);
    }
    
    getTruncatedTitle(title: string): string {
        // Remove "Test: " prefix for the label to save space
        const cleanTitle = title.startsWith('Test: ') ? title.substring(6) : title;
        // Truncate to first 8 characters for the label
        return cleanTitle.length > 8 ? cleanTitle.substring(0, 8) + '...' : cleanTitle;
    }
}

@Injectable({
    providedIn: 'root'
})
export class WindowDockService {
    private dockComponent?: ComponentRef<WindowDockComponent>;
    
    constructor(
        private appRef: ApplicationRef,
        private injector: Injector
    ) {}
    
    private ensureDockExists() {
        if (!this.dockComponent) {
            // Create dock component
            this.dockComponent = createComponent(WindowDockComponent, {
                environmentInjector: this.appRef.injector,
                elementInjector: this.injector
            });
            
            // Attach to DOM
            document.body.appendChild(this.dockComponent.location.nativeElement);
            this.appRef.attachView(this.dockComponent.hostView);
        }
    }
    
    addWindow(windowId: string, title: string, icon?: string, restoreCallback?: () => void, iconUrl?: string, progress?: number) {
        this.ensureDockExists();
        if (this.dockComponent) {
            this.dockComponent.instance.addItem({
                windowId,
                title,
                icon,
                iconUrl,
                restoreCallback: restoreCallback || (() => {}),
                progress
            });
        }
    }
    
    removeWindow(windowId: string) {
        if (this.dockComponent) {
            this.dockComponent.instance.removeItem(windowId);
            
            // If no more items, remove the dock
            if (this.dockComponent.instance.dockItems.length === 0) {
                this.appRef.detachView(this.dockComponent.hostView);
                this.dockComponent.destroy();
                this.dockComponent = undefined;
            }
        }
    }
    
    updateWindowProgress(windowId: string, progress: number | undefined) {
        if (this.dockComponent) {
            const item = this.dockComponent.instance.dockItems.find(i => i.windowId === windowId);
            if (item) {
                item.progress = progress;
            }
        }
    }
}