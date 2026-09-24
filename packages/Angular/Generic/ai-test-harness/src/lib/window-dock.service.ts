import { Injectable, Component, ComponentRef, ApplicationRef, Injector, createComponent } from '@angular/core';

export interface DockItem {
    WindowId: string;
    Title: string;
    Icon?: string;
    IconUrl?: string;
    RestoreCallback: () => void;
    progress?: number; // 0-100 for progress indicator — case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

@Component({
    selector: 'mj-window-dock',
    standalone: true,
    imports: [],
    template: `
        <div class="window-dock">
            @for (item of dockItems; track item.WindowId) {
                <div class="dock-item" 
                     [title]="item.Title"
                     (click)="restoreWindow(item)">
                    <i [class]="item.Icon"></i>
                    <span class="dock-item-label">{{ getTruncatedTitle(item.Title) }}</span>
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
    DockItems: DockItem[] = [];

    /** @deprecated Use {@link DockItems}. */
    get dockItems(): DockItem[] {
        return this.DockItems;
    }
    /** @deprecated Use {@link DockItems}. */
    set dockItems(value: DockItem[]) {
        this.DockItems = value;
    }
    
    AddItem(item: DockItem) {
        this.DockItems.push(item);
    }

    /** @deprecated Use {@link AddItem}. */
    addItem(item: DockItem) {
        return this.AddItem(item);
    }
    
    RemoveItem(windowId: string) {
        this.DockItems = this.DockItems.filter(item => item.WindowId !== windowId);
    }

    /** @deprecated Use {@link RemoveItem}. */
    removeItem(windowId: string) {
        return this.RemoveItem(windowId);
    }
    
    RestoreWindow(item: DockItem) {
        item.RestoreCallback();
        this.RemoveItem(item.WindowId);
    }

    /** @deprecated Use {@link RestoreWindow}. */
    restoreWindow(item: DockItem) {
        return this.RestoreWindow(item);
    }
    
    GetTruncatedTitle(title: string): string {
        // Remove "Test: " prefix for the label to save space
        const cleanTitle = title.startsWith('Test: ') ? title.substring(6) : title;
        // Truncate to first 8 characters for the label
        return cleanTitle.length > 8 ? cleanTitle.substring(0, 8) + '...' : cleanTitle;
    }

    /** @deprecated Use {@link GetTruncatedTitle}. */
    getTruncatedTitle(title: string): string {
        return this.GetTruncatedTitle(title);
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
    
    AddWindow(windowId: string, title: string, icon?: string, restoreCallback?: () => void, iconUrl?: string, progress?: number) {
        this.ensureDockExists();
        if (this.dockComponent) {
            this.dockComponent.instance.addItem({
                WindowId: windowId,
                Title: title,
                Icon: icon,
                IconUrl: iconUrl,
                RestoreCallback: restoreCallback || (() => {}),
                progress
            });
        }
    }

    /** @deprecated Use {@link AddWindow}. */
    addWindow(windowId: string, title: string, icon?: string, restoreCallback?: () => void, iconUrl?: string, progress?: number) {
        return this.AddWindow(windowId, title, icon, restoreCallback, iconUrl, progress);
    }
    
    RemoveWindow(windowId: string) {
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

    /** @deprecated Use {@link RemoveWindow}. */
    removeWindow(windowId: string) {
        return this.RemoveWindow(windowId);
    }
    
    UpdateWindowProgress(windowId: string, progress: number | undefined) {
        if (this.dockComponent) {
            const item = this.dockComponent.instance.dockItems.find(i => i.WindowId === windowId);
            if (item) {
                item.progress = progress;
            }
        }
    }

    /** @deprecated Use {@link UpdateWindowProgress}. */
    updateWindowProgress(windowId: string, progress: number | undefined) {
        return this.UpdateWindowProgress(windowId, progress);
    }
}