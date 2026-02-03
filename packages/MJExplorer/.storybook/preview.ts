import type { Preview } from '@storybook/angular';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'mj-surface', value: '#f8f9fa' },
        { name: 'dark', value: '#1a1a2e' },
        { name: 'mj-primary', value: '#0066cc' },
      ],
    },
    docs: {
      toc: true,
    },
  },
};

export default preview;
