/**
 * WatchFileFilter: the files `mj sync watch` reacts to in an entity folder.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { WatchFileFilter } from '../lib/watch-file-filter';

const DIR = path.resolve('/meta/widgets');
const at = (...parts: string[]) => path.join(DIR, ...parts);
const file = { isFile: () => true };
const folder = { isFile: () => false };

describe('WatchFileFilter', () => {
  it('matches a top-level-only pattern only at the top level', () => {
    const filter = new WatchFileFilter(DIR, '.*.json');

    expect(filter.Accepts(at('.w.json'))).toBe(true);
    expect(filter.Accepts(at('sub', '.w.json'))).toBe(false);
    expect(filter.Accepts(at('w.json'))).toBe(false);
  });

  it('matches a recursive dot-file pattern in sub-folders', () => {
    const filter = new WatchFileFilter(DIR, '**/.*.json');

    expect(filter.Accepts(at('.w.json'))).toBe(true);
    expect(filter.Accepts(at('sub', '.w.json'))).toBe(true);
  });

  it('uses the push default *.json (top level, dot files included) when the folder gives no pattern', () => {
    const filter = new WatchFileFilter(DIR, undefined);

    expect(filter.Accepts(at('w.json'))).toBe(true);
    expect(filter.Accepts(at('.w.json'))).toBe(true);
    expect(filter.Accepts(at('sub', 'side.json'))).toBe(false);
  });

  it('accepts external files by extension and refuses other files', () => {
    const filter = new WatchFileFilter(DIR, '.*.json');

    expect(filter.Accepts(at('docs', 'a.md'))).toBe(true);
    expect(filter.Accepts(at('q.SQL'))).toBe(true);
    expect(filter.Accepts(at('notes.csv'))).toBe(false);
  });

  it('refuses config files, backups, node_modules, .git and ignore patterns', () => {
    const filter = new WatchFileFilter(DIR, undefined, ['**/drafts/**']);

    expect(filter.Accepts(at('.mj-sync.json'))).toBe(false);
    expect(filter.Accepts(at('.mj-other.json'))).toBe(false);
    expect(filter.Accepts(at('sub', '.mj-folder.json'))).toBe(false);
    expect(filter.Accepts(at('w.json.backup'))).toBe(false);
    expect(filter.Accepts(at('node_modules', 'x.json'))).toBe(false);
    expect(filter.Accepts(at('.git', 'x.json'))).toBe(false);
    expect(filter.Accepts(at('drafts', 'w.json'))).toBe(false);
  });

  it('never ignores the folder or a sub-folder outside the ignore list, and ignores the rest by stats', () => {
    const filter = new WatchFileFilter(DIR, '.*.json');

    expect(filter.Ignored(DIR, folder)).toBe(false);
    expect(filter.Ignored(at('sub.json'), folder)).toBe(false);
    expect(filter.Ignored(at('sub'))).toBe(false);
    expect(filter.Ignored(at('node_modules'), folder)).toBe(true);
    expect(filter.Ignored(at('notes.csv'), file)).toBe(true);
    expect(filter.Ignored(at('.w.json'), file)).toBe(false);
  });
});
