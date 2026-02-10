import { Routes } from '@angular/router';
import { StyleGuideComponent } from './style-guide/style-guide.component';

export const routes: Routes = [
    {
        path: '',
        component: StyleGuideComponent,
        children: [
            { path: '', redirectTo: 'colors', pathMatch: 'full' },
            {
                path: 'colors',
                loadComponent: () => import('./style-guide/colors/colors.component').then(m => m.ColorsComponent)
            },
            {
                path: 'typography',
                loadComponent: () => import('./style-guide/typography/typography.component').then(m => m.TypographyComponent)
            },
            {
                path: 'buttons',
                loadComponent: () => import('./style-guide/buttons-inputs/buttons-inputs.component').then(m => m.ButtonsInputsComponent)
            },
            {
                path: 'data',
                loadComponent: () => import('./style-guide/data-display/data-display.component').then(m => m.DataDisplayComponent)
            },
            {
                path: 'form-selects',
                loadComponent: () => import('./style-guide/form-selects/form-selects.component').then(m => m.FormSelectsComponent)
            },
            {
                path: 'data-hierarchy',
                loadComponent: () => import('./style-guide/data-hierarchy/data-hierarchy.component').then(m => m.DataHierarchyComponent)
            },
            {
                path: 'panels',
                loadComponent: () => import('./style-guide/panels/panels.component').then(m => m.PanelsComponent)
            },
            {
                path: 'grid',
                loadComponent: () => import('./style-guide/grid/grid.component').then(m => m.GridComponent)
            },
            {
                path: 'overlays',
                loadComponent: () => import('./style-guide/overlays/overlays.component').then(m => m.OverlaysComponent)
            },
            {
                path: 'menus',
                loadComponent: () => import('./style-guide/menus/menus.component').then(m => m.MenusComponent)
            },
            {
                path: 'messages',
                loadComponent: () => import('./style-guide/messages/messages.component').then(m => m.MessagesComponent)
            },
            {
                path: 'charts',
                loadComponent: () => import('./style-guide/charts/charts.component').then(m => m.ChartsComponent)
            },
            {
                path: 'misc',
                loadComponent: () => import('./style-guide/misc/misc.component').then(m => m.MiscComponent)
            },
            {
                path: 'dashboard',
                loadComponent: () => import('./dashboard.component').then(m => m.DashboardComponent)
            }
        ]
    }
];
