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
                loadComponent: () => import('./style-guide/buttons/buttons.component').then(m => m.ButtonsComponent)
            },
            {
                path: 'form-inputs',
                loadComponent: () => import('./style-guide/form-inputs/form-inputs.component').then(m => m.FormInputsComponent)
            },
            {
                path: 'form-selects',
                loadComponent: () => import('./style-guide/form-selects/form-selects.component').then(m => m.FormSelectsComponent)
            },
            {
                path: 'data-display',
                loadComponent: () => import('./style-guide/data-display/data-display.component').then(m => m.DataDisplayComponent)
            },
            {
                path: 'navigation',
                loadComponent: () => import('./style-guide/navigation/navigation.component').then(m => m.NavigationComponent)
            },
            {
                path: 'layout',
                loadComponent: () => import('./style-guide/layout/layout.component').then(m => m.LayoutComponent)
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
                path: 'indicators',
                loadComponent: () => import('./style-guide/indicators/indicators.component').then(m => m.IndicatorsComponent)
            },
            {
                path: 'misc',
                loadComponent: () => import('./style-guide/misc/misc.component').then(m => m.MiscComponent)
            },
            {
                path: 'charts',
                loadComponent: () => import('./style-guide/charts/charts.component').then(m => m.ChartsComponent)
            },
            {
                path: 'dashboard',
                loadComponent: () => import('./dashboard.component').then(m => m.DashboardComponent)
            }
        ]
    }
];
