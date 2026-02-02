export * from './lib/versions.module';
export * from './lib/types';
export * from './lib/panel/slide-panel.component';
export * from './lib/record-micro-view/record-micro-view.component';
export * from './lib/label-create/label-create.component';
export * from './lib/label-detail/label-detail.component';

// Tree-shaking prevention
import { LoadMjLabelCreateComponent } from './lib/label-create/label-create.component';
LoadMjLabelCreateComponent();
