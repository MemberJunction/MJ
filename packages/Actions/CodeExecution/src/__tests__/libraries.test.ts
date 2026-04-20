import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ALLOWED_MODULES, isModuleAllowed, getAllowedModuleNames, getLibrarySource } from '../libraries';

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
        expect(isModuleAllowed(mod)).toBe(true);
      }
    });

    it('should return false for blocked modules', () => {
      expect(isModuleAllowed('fs')).toBe(false);
      expect(isModuleAllowed('http')).toBe(false);
      expect(isModuleAllowed('child_process')).toBe(false);
      expect(isModuleAllowed('net')).toBe(false);
      expect(isModuleAllowed('os')).toBe(false);
      expect(isModuleAllowed('process')).toBe(false);
    });

    it('should return false for arbitrary module names', () => {
      expect(isModuleAllowed('express')).toBe(false);
      expect(isModuleAllowed('axios')).toBe(false);
      expect(isModuleAllowed('shell')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isModuleAllowed('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isModuleAllowed('Lodash')).toBe(false);
      expect(isModuleAllowed('LODASH')).toBe(false);
      expect(isModuleAllowed('UUID')).toBe(false);
    });

    it('should act as a type guard', () => {
      const moduleName: string = 'lodash';
      if (isModuleAllowed(moduleName)) {
        // Inside this block, moduleName should be typed as AllowedModule
        const allowed: typeof ALLOWED_MODULES[number] = moduleName;
        expect(allowed).toBe('lodash');
      }
    });
  });

  describe('getAllowedModuleNames', () => {
    it('should return an array of all allowed module names', () => {
      const names = getAllowedModuleNames();
      expect(names).toHaveLength(7);
      expect(names).toContain('lodash');
      expect(names).toContain('date-fns');
      expect(names).toContain('uuid');
      expect(names).toContain('validator');
    });

    it('should return a copy, not the original array', () => {
      const names1 = getAllowedModuleNames();
      const names2 = getAllowedModuleNames();
      expect(names1).not.toBe(names2);
      expect(names1).toEqual(names2);
    });

    it('should return string array', () => {
      const names = getAllowedModuleNames();
      for (const name of names) {
        expect(typeof name).toBe('string');
      }
    });
  });

  describe('getLibrarySource', () => {
    it('should return null for non-allowed modules', () => {
      expect(getLibrarySource('fs')).toBeNull();
      expect(getLibrarySource('http')).toBeNull();
      expect(getLibrarySource('nonexistent')).toBeNull();
    });

    it('should return a string for lodash', () => {
      const source = getLibrarySource('lodash');
      expect(source).not.toBeNull();
      expect(typeof source).toBe('string');
    });

    it('should return lodash source with expected functions', () => {
      const source = getLibrarySource('lodash')!;
      expect(source).toContain('chunk');
      expect(source).toContain('compact');
      expect(source).toContain('flatten');
      expect(source).toContain('uniq');
      expect(source).toContain('groupBy');
      expect(source).toContain('keyBy');
      expect(source).toContain('sortBy');
      expect(source).toContain('pick');
      expect(source).toContain('omit');
      expect(source).toContain('get');
      expect(source).toContain('set');
      expect(source).toContain('sum');
      expect(source).toContain('mean');
      expect(source).toContain('cloneDeep');
    });

    it('should return date-fns source with expected functions', () => {
      const source = getLibrarySource('date-fns')!;
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
      const source = getLibrarySource('uuid')!;
      expect(source).not.toBeNull();
      expect(source).toContain('v4');
      expect(source).toContain('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
    });

    it('should return validator source with validation functions', () => {
      const source = getLibrarySource('validator')!;
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
      const lodashSource = getLibrarySource('lodash')!;
      // Should be wrapped in an IIFE that returns the object
      expect(lodashSource).toMatch(/^\(function\(\)/);
      expect(lodashSource).toContain('return _');

      const dateFnsSource = getLibrarySource('date-fns')!;
      expect(dateFnsSource).toMatch(/^\(function\(\)/);
      expect(dateFnsSource).toContain('return dateFns');
    });

    it('should return wrapped IIFE for bundled mathjs', () => {
      const source = getLibrarySource('mathjs');
      expect(source).not.toBeNull();
      expect(source).toContain('return math');
    });

    it('should return wrapped IIFE for bundled papaparse', () => {
      const source = getLibrarySource('papaparse');
      expect(source).not.toBeNull();
      expect(source).toContain('return Papa');
    });

    it('should return wrapped IIFE for bundled jstat', () => {
      const source = getLibrarySource('jstat');
      expect(source).not.toBeNull();
      expect(source).toContain('return jStat');
    });

    it('should return null for empty string', () => {
      expect(getLibrarySource('')).toBeNull();
    });
  });
});
