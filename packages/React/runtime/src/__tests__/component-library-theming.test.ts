import { describe, it, expect } from 'vitest';
import { BuildAntdThemeConfig } from '../utilities/component-library-theming';

const antd = { theme: { darkAlgorithm: 'dark-algorithm', defaultAlgorithm: 'default-algorithm' } };
const algorithmFor = (background: string): unknown =>
  BuildAntdThemeConfig({ colors: { background } } as Parameters<typeof BuildAntdThemeConfig>[0], antd)['algorithm'];

describe('BuildAntdThemeConfig background luminance', () => {
  it.each([
    ['#000000', 'dark-algorithm'],
    ['#fff', 'default-algorithm'],
    ['rgb(10, 10, 10)', 'dark-algorithm'],
    ['RGBA(250,250,250,0.5)', 'default-algorithm'],
    ['background: rgba(0, 0, 0, 1) !important', 'dark-algorithm'],
    ['rgb() rgb(0,0,0)', 'dark-algorithm'],
    ['rgb(0, 0', 'default-algorithm'],
    ['hsl(0, 0%, 0%)', 'default-algorithm'],
  ])('picks the algorithm for %j', (background, algorithm) => {
    expect(algorithmFor(background)).toBe(algorithm);
  });

  it('reads 100k characters of unclosed "rgb((" calls in linear time', () => {
    const started = Date.now();
    expect(algorithmFor('rgb(('.repeat(20_000))).toBe('default-algorithm');
    expect(Date.now() - started).toBeLessThan(2500);
  });
});
