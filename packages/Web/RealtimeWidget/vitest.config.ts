import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
      test: {
          globals: true,
          // jsdom gives us customElements + attachShadow so the web component can be
          // mounted and its shadow root inspected in unit tests (no real layout/CSS).
          environment: 'jsdom',
          include: ['src/__tests__/**/*.test.ts'],
      },
  })
);
