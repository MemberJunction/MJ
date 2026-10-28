import { describe, it, expect } from 'vitest';
import { TrainerContract, REQUIRED_LIBRARIES, type CodeVersion } from '../index';

const complete: CodeVersion = {
  psGitSha: 'c92d4a47f957dcc5054cb5bbd52f4a7b39acb673',
  sidecarVersion: '6.2.0',
  libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' },
  threads: 1,
  seed: 0,
};

describe('CodeVersionGaps (a lineage without library versions or a thread count is refused)', () => {
  it('accepts a complete code version', () => {
    expect(TrainerContract.CodeVersionGaps(complete)).toEqual([]);
  });

  it('names every missing library and a missing thread count', () => {
    const partial: CodeVersion = { ...complete, libraryVersions: { python: '3.11.15', numpy: ' ' }, threads: 0 };
    expect(TrainerContract.CodeVersionGaps(partial)).toEqual([
      'libraryVersions.numpy',
      'libraryVersions.scikit-learn',
      'libraryVersions.xgboost',
      'libraryVersions.lightgbm',
      'threads',
    ]);
  });

  it('requires exactly the libraries the lineage rule names', () => {
    expect([...REQUIRED_LIBRARIES]).toEqual(['python', 'numpy', 'scikit-learn', 'xgboost', 'lightgbm']);
  });
});
