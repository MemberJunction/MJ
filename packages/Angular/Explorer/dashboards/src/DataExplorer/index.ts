// Data Explorer Dashboard - Main exports

// Dashboard component
export { DataExplorerDashboardComponent, LoadDataExplorerDashboard } from './data-explorer-dashboard.component';

// Child components
export { NavigationPanelComponent } from './components/navigation-panel/navigation-panel.component';
export { CardsViewComponent } from './components/content-area/cards-view.component';
export { GridViewComponent } from './components/content-area/grid-view.component';
export { DetailPanelComponent, NavigateToRelatedEvent } from './components/detail-panel/detail-panel.component';

// Services
export { ExplorerStateService } from './services/explorer-state.service';

// Models
export * from './models/explorer-state.interface';
