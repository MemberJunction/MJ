// Lists Dashboard Components
export * from './components/lists-my-lists-resource.component';
export * from './components/lists-browse-resource.component';
export * from './components/lists-categories-resource.component';
export * from './components/lists-operations-resource.component';
export * from './components/venn-diagram/venn-diagram.component';

// Services
export * from './services/list-set-operations.service';

// Loader function to prevent tree shaking
import { LoadListsMyListsResource } from './components/lists-my-lists-resource.component';
import { LoadListsBrowseResource } from './components/lists-browse-resource.component';
import { LoadListsCategoriesResource } from './components/lists-categories-resource.component';
import { LoadListsOperationsResource } from './components/lists-operations-resource.component';

export function LoadListsResources() {
    LoadListsMyListsResource();
    LoadListsBrowseResource();
    LoadListsCategoriesResource();
    LoadListsOperationsResource();
}
