import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ALLOWED_MODULES, IsModuleAllowed, GetAllowedModuleNames, GetLibrarySource } from '../libraries';

// Mock fs for bundled library loading
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue('var math = {}; var Papa = {}; var jStat = {};')
  }
}));

// Mock url module for ESM __dirname workaround
vi.mock('url', () => ({
  fileURLToPath: vi.fn().mockReturnValue('/fake/path/libraries/index.ts')
}));

describe('Libraries', () => {
  describe('ALLOWED_MODULES', () => {
    it('should contain all expected modules', () => {
      expect(ALLOWED_MODULES).toContain('lodash');
      expect(ALLOWED_MODULES).toContain('date-fns');
      expect(ALLOWED_MODULES).toContain('mathjs');
      expect(ALLOWED_MODULES).toContain('papaparse');
      expect(ALLOWED_MODULES).toContain('jstat');
      expect(ALLOWED_MODULES).toContain('uuid');
      expect(ALLOWED_MODULES).toContain('validator');
    });

    it('should have exactly 7 allowed modules', () => {
      expect(ALLOWED_MODULES).toHaveLength(7);
    });

    it('should be a readonly tuple', () => {
      // The array should not contain any dangerous modules
      const dangerousModules = ['fs', 'path', 'http', 'https', 'net', 'child_process', 'os', 'process'];
      for (const mod of dangerousModules) {
        expect(ALLOWED_MODULES).not.toContain(mod);
      }
    });
  });

  describe('isModuleAllowed', () => {
    it('should return true for all allowed modules', () => {
      for (const mod of ALLOWED_MODULES) {
        expect(IsModuleAllowed(mod)).toBe(true);
      }
    });

    it('should return false for blocked modules', () => {
      expect(IsModuleAllowed('fs')).toBe(false);
      expect(IsModuleAllowed('http')).toBe(false);
      expect(IsModuleAllowed('child_process')).toBe(false);
      expect(IsModuleAllowed('net')).toBe(false);
      expect(IsModuleAllowed('os')).toBe(false);
      expect(IsModuleAllowed('process')).toBe(false);
    });

    it('should return false for arbitrary module names', () => {
      expect(IsModuleAllowed('express')).toBe(false);
      expect(IsModuleAllowed('axios')).toBe(false);
      expect(IsModuleAllowed('shell')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(IsModuleAllowed('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(IsModuleAllowed('Lodash')).toBe(false);
      expect(IsModuleAllowed('LODASH')).toBe(false);
      expect(IsModuleAllowed('UUID')).toBe(false);
    });

    it('should act as a type guard', () => {
      const moduleName: string = 'lodash';
      if (IsModuleAllowed(moduleName)) {
        // Inside this block, moduleName should be typed as AllowedModule
        const allowed: typeof ALLOWED_MODULES[number] = moduleName;
        expect(allowed).toBe('lodash');
      }
    });
  });

  describe('getAllowedModuleNames', () => {
    it('should return an array of all allowed module names', () => {
      const names = GetAllowedModuleNames();
      expect(names).toHaveLength(7);
      expect(names).toContain('lodash');
      expect(names).toContain('date-fns');
      expect(names).toContain('uuid');
      expect(names).toContain('validator');
    });

    it('should return a copy, not the original array', () => {
      const names1 = GetAllowedModuleNames();
      const names2 = GetAllowedModuleNames();
      expect(names1).not.toBe(names2);
      expect(names1).toEqual(names2);
    });

    it('should return string array', () => {
      const names = GetAllowedModuleNames();
      for (const name of names) {
        expect(typeof name).toBe('string');
      }
    });
  });

  describe('getLibrarySource', () => {
    it('should return null for non-allowed modules', () => {
      expect(GetLibrarySource('fs')).toBeNull();
      expect(GetLibrarySource('http')).toBeNull();
      expect(GetLibrarySource('nonexistent')).toBeNull();
    });

    it('should return a string for lodash', () => {
      const source = GetLibrarySource('lodash');
      expect(source).not.toBeNull();
      expect(typeof source).toBe('string');
    });

    it('should return bundled lodash wrapped in module-shim IIFE', () => {
      // NOTE: fs.readFileSync is mocked at the top of this test file, so the
      // "source" we get here is our IIFE wrapper around the stub content —
      // NOT the real ~73KB lodash bundle. We assert the shape of the wrapper
      // (proves we switched away from the old hand-coded subset). End-to-end
      // behavior of real lodash is exercised by Runtime action integration
      // tests, not here.
      const source = GetLibrarySource('lodash')!;
      expect(source).toContain('const module = { exports: {} }');
      expect(source).toContain('return module.exports');
      // Old subset signature absent — we no longer wire up getLodashSource().
      expect(source).not.toContain('chunk: function(array');
    });

    it('should return date-fns source with expected functions', () => {
      const source = GetLibrarySource('date-fns')!;
      expect(source).not.toBeNull();
      expect(source).toContain('format');
      expect(source).toContain('addDays');
      expect(source).toContain('subDays');
      expect(source).toContain('addMonths');
      expect(source).toContain('differenceInDays');
      expect(source).toContain('isAfter');
      expect(source).toContain('isBefore');
      expect(source).toContain('startOfDay');
      expect(source).toContain('endOfDay');
      expect(source).toContain('parseISO');
    });

    it('should return uuid source with v4 function', () => {
      const source = GetLibrarySource('uuid')!;
      expect(source).not.toBeNull();
      expect(source).toContain('v4');
      expect(source).toContain('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
    });

    it('should return validator source with validation functions', () => {
      const source = GetLibrarySource('validator')!;
      expect(source).not.toBeNull();
      expect(source).toContain('isEmail');
      expect(source).toContain('isURL');
      expect(source).toContain('isNumeric');
      expect(source).toContain('isAlpha');
      expect(source).toContain('isAlphanumeric');
      expect(source).toContain('isEmpty');
      expect(source).toContain('isLength');
      expect(source).toContain('matches');
    });

    it('should return wrapped IIFE for inline libraries', () => {
      const lodashSource = GetLibrarySource('lodash')!;
      // Lodash is now the bundled UMD wrapped in our module-shim IIFE.
      expect(lodashSource).toMatch(/^\(function\(\)/);
      expect(lodashSource).toContain('return module.exports');

      const dateFnsSource = GetLibrarySource('date-fns')!;
      expect(dateFnsSource).toMatch(/^\(function\(\)/);
      expect(dateFnsSource).toContain('return dateFns');
    });

    it('should return wrapped IIFE for bundled mathjs', () => {
      const source = GetLibrarySource('mathjs');
      expect(source).not.toBeNull();
      expect(source).toContain('return math');
    });

    it('should return wrapped IIFE for bundled papaparse', () => {
      const source = GetLibrarySource('papaparse');
      expect(source).not.toBeNull();
      expect(source).toContain('return Papa');
    });

    it('should return wrapped IIFE for bundled jstat', () => {
      const source = GetLibrarySource('jstat');
      expect(source).not.toBeNull();
      expect(source).toContain('return jStat');
    });

    it('should return null for empty string', () => {
      expect(GetLibrarySource('')).toBeNull();
    });
  });
});
