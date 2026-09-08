import { defineConfig, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../vitest.dom.shared';

// M5 joined workspace: Analog and TestBed resolve @angular/* from different
// .pnpm stores (M5 vs MJ). Inlining through Vite collapses them so constructor
// inject() sees the TestBed injector (otherwise NG0203).
const ANGULAR = [
  '@angular/core',
  '@angular/common',
  '@angular/compiler',
  '@angular/forms',
  '@angular/platform-browser',
  '@angular/router',
];

export default mergeConfig(
  domSharedConfig,
  defineConfig({
    resolve: { dedupe: ANGULAR },
    test: {
      name: '@memberjunction/ng-bootstrap',
      server: { deps: { inline: ANGULAR } },
    },
  }),
);
