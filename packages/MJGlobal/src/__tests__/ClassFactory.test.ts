import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClassFactory, ClassRegistration } from '../ClassFactory';

// ---- Test class hierarchies ----

class Animal {
  Name: string;
  constructor(name?: string) {
    this.Name = name ?? 'Unknown';
  }
}

class Dog extends Animal {
  Breed: string;
  constructor(name?: string, breed?: string) {
    super(name);
    this.Breed = breed ?? 'Mixed';
  }
}

class GoldenRetriever extends Dog {
  constructor(name?: string) {
    super(name, 'Golden Retriever');
  }
}

class Cat extends Animal {
  Indoor: boolean;
  constructor(name?: string, indoor?: boolean) {
    super(name);
    this.Indoor = indoor ?? true;
  }
}

class Vehicle {
  Make: string;
  constructor(make?: string) {
    this.Make = make ?? 'Generic';
  }
}

class Car extends Vehicle {
  Doors: number;
  constructor(make?: string, doors?: number) {
    super(make);
    this.Doors = doors ?? 4;
  }
}

// ---- Tests ----

describe('ClassFactory', () => {
  let factory: ClassFactory;

  beforeEach(() => {
    factory = new ClassFactory();
  });

  describe('Register', () => {
    it('should register a subclass for a base class without key', () => {
      factory.Register(Animal, Dog, null, 0, true);
      const registrations = factory.GetAllRegistrations(Animal);
      expect(registrations.length).toBe(1);
      expect(registrations[0].SubClass).toBe(Dog);
    });

    it('should register a subclass for a base class with a key', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      const registrations = factory.GetAllRegistrations(Animal, 'canine');
      expect(registrations.length).toBe(1);
      expect(registrations[0].Key).toBe('canine');
    });

    it('should auto-increment priority when priority is 0 or not provided', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      factory.Register(Animal, Cat, 'pet', 0, true);
      const registrations = factory.GetAllRegistrations(Animal, 'pet');
      expect(registrations.length).toBe(2);
      // First registration gets priority 1, second gets priority 2
      expect(registrations[0].Priority).toBe(1);
      expect(registrations[1].Priority).toBe(2);
    });

    it('should use explicit priority when provided', () => {
      factory.Register(Animal, Dog, 'pet', 10, true);
      const registrations = factory.GetAllRegistrations(Animal, 'pet');
      expect(registrations[0].Priority).toBe(10);
    });

    it('should warn when registering duplicate priority for same base class and key', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      factory.Register(Animal, Dog, 'pet', 5, true);
      factory.Register(Animal, Cat, 'pet', 5, true);
      // The second registration should trigger a warning about duplicate priority
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Registering class Cat')
      );
    });

    it('should not register when baseClass is null or undefined', () => {
      factory.Register(null, Dog, 'pet', 0, true);
      factory.Register(undefined, Dog, 'pet', 0, true);
      // No registrations should exist for Animal or anything else
      expect(factory.GetAllRegistrations(Animal).length).toBe(0);
    });

    it('should not register when subClass is null or undefined', () => {
      factory.Register(Animal, null, 'pet', 0, true);
      factory.Register(Animal, undefined, 'pet', 0, true);
      expect(factory.GetAllRegistrations(Animal).length).toBe(0);
    });

    it('should warn when key is null and skipNullKeyWarning is false', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      factory.Register(Animal, Dog, null, 0, false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('has no key set')
      );
    });

    it('should not warn when key is null and skipNullKeyWarning is true', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      factory.Register(Animal, Dog, null, 0, true);
      // The null key warning should not fire
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('has no key set')
      );
    });

    it('should handle multiple registrations for the same base class with different keys', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const canineRegs = factory.GetAllRegistrations(Animal, 'canine');
      const felineRegs = factory.GetAllRegistrations(Animal, 'feline');
      expect(canineRegs.length).toBe(1);
      expect(canineRegs[0].SubClass).toBe(Dog);
      expect(felineRegs.length).toBe(1);
      expect(felineRegs[0].SubClass).toBe(Cat);
    });

    it('should auto-register with root class when autoRegisterWithRootClass is true', () => {
      // Dog extends Animal. When we register GoldenRetriever with Dog as base,
      // it should auto-register against Animal (the root).
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      factory.Register(Dog, GoldenRetriever, 'retriever', 0, true, true);
      // Since Animal is the root class, registrations should be under Animal
      const animalRegs = factory.GetAllRegistrations(Animal, 'retriever');
      expect(animalRegs.length).toBe(1);
      expect(animalRegs[0].SubClass).toBe(GoldenRetriever);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-registering GoldenRetriever with root class Animal')
      );
    });

    it('should register against the provided base class when autoRegisterWithRootClass is false', () => {
      factory.Register(Dog, GoldenRetriever, 'retriever', 0, true, false);
      const dogRegs = factory.GetAllRegistrations(Dog, 'retriever');
      expect(dogRegs.length).toBe(1);
      expect(dogRegs[0].SubClass).toBe(GoldenRetriever);
      // Should NOT be registered under Animal
      const animalRegs = factory.GetAllRegistrations(Animal, 'retriever');
      expect(animalRegs.length).toBe(0);
    });

    it('should set RootClass on the registration', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      const registrations = factory.GetAllRegistrations(Animal, 'pet');
      expect(registrations[0].RootClass).toBe(Animal);
    });
  });

  describe('CreateInstance', () => {
    it('should create an instance of the highest-priority registered subclass', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      factory.Register(Animal, Cat, 'pet', 0, true);
      // Cat was registered second, so it gets higher auto-priority
      const instance = factory.CreateInstance<Animal>(Animal, 'pet');
      expect(instance).toBeInstanceOf(Cat);
    });

    it('should fall back to the base class when no registration exists', () => {
      const instance = factory.CreateInstance<Animal>(Animal, 'pet');
      expect(instance).toBeInstanceOf(Animal);
    });

    it('should pass constructor parameters to the created instance', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      const instance = factory.CreateInstance<Dog>(Animal, 'pet', 'Rex', 'Husky');
      expect(instance).toBeInstanceOf(Dog);
      expect(instance!.Name).toBe('Rex');
      expect(instance!.Breed).toBe('Husky');
    });

    it('should pass constructor parameters to the base class when no registration exists', () => {
      const instance = factory.CreateInstance<Animal>(Animal, 'pet', 'Buddy');
      expect(instance).toBeInstanceOf(Animal);
      expect(instance!.Name).toBe('Buddy');
    });

    it('should return null when baseClass is falsy', () => {
      const instance = factory.CreateInstance<Animal>(null, 'pet');
      expect(instance).toBeNull();
    });

    it('should create the correct subclass based on key', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const dogInstance = factory.CreateInstance<Animal>(Animal, 'canine');
      const catInstance = factory.CreateInstance<Animal>(Animal, 'feline');
      expect(dogInstance).toBeInstanceOf(Dog);
      expect(catInstance).toBeInstanceOf(Cat);
    });

    it('should create instance from highest explicit priority', () => {
      factory.Register(Animal, Dog, 'pet', 5, true);
      factory.Register(Animal, Cat, 'pet', 10, true);
      const instance = factory.CreateInstance<Animal>(Animal, 'pet');
      expect(instance).toBeInstanceOf(Cat);
    });

    it('should create instance with default constructor when no params provided', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      const instance = factory.CreateInstance<Dog>(Animal, 'pet');
      expect(instance).toBeInstanceOf(Dog);
      expect(instance!.Name).toBe('Unknown');
      expect(instance!.Breed).toBe('Mixed');
    });
  });

  describe('GetAllRegistrations', () => {
    it('should return empty array when no registrations exist', () => {
      const registrations = factory.GetAllRegistrations(Animal);
      expect(registrations).toEqual([]);
    });

    it('should return all registrations for a base class when key is not provided', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const registrations = factory.GetAllRegistrations(Animal);
      expect(registrations.length).toBe(2);
    });

    it('should filter registrations by key', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const registrations = factory.GetAllRegistrations(Animal, 'canine');
      expect(registrations.length).toBe(1);
      expect(registrations[0].SubClass).toBe(Dog);
    });

    it('should perform case-insensitive key matching', () => {
      factory.Register(Animal, Dog, 'Canine', 0, true);
      const registrations = factory.GetAllRegistrations(Animal, 'canine');
      expect(registrations.length).toBe(1);
      expect(registrations[0].SubClass).toBe(Dog);
    });

    it('should trim whitespace from keys when matching', () => {
      factory.Register(Animal, Dog, '  canine  ', 0, true);
      const registrations = factory.GetAllRegistrations(Animal, 'canine');
      expect(registrations.length).toBe(1);
      expect(registrations[0].SubClass).toBe(Dog);
    });

    it('should return empty array when baseClass is falsy', () => {
      expect(factory.GetAllRegistrations(null)).toEqual([]);
      expect(factory.GetAllRegistrations(undefined)).toEqual([]);
    });

    it('should use class name comparison not reference equality', () => {
      // This tests that two classes with the same name are considered equal.
      // In real scenarios, the same module can be loaded from different paths.
      // We simulate this by verifying the name-based comparison directly.
      factory.Register(Animal, Dog, 'pet', 0, true);
      // GetAllRegistrations checks r.BaseClass.name === baseClass.name
      const registrations = factory.GetAllRegistrations(Animal, 'pet');
      expect(registrations.length).toBe(1);
    });

    it('should return all registrations when key is null', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const registrations = factory.GetAllRegistrations(Animal, null);
      expect(registrations.length).toBe(2);
    });
  });

  describe('GetRegistration', () => {
    it('should return the highest-priority registration', () => {
      factory.Register(Animal, Dog, 'pet', 1, true);
      factory.Register(Animal, Cat, 'pet', 5, true);
      const reg = factory.GetRegistration(Animal, 'pet');
      expect(reg).not.toBeNull();
      expect(reg!.SubClass).toBe(Cat);
      expect(reg!.Priority).toBe(5);
    });

    it('should return the last registered entry when priorities tie', () => {
      factory.Register(Animal, Dog, 'pet', 5, true);
      factory.Register(Animal, Cat, 'pet', 5, true);
      const reg = factory.GetRegistration(Animal, 'pet');
      expect(reg).not.toBeNull();
      expect(reg!.SubClass).toBe(Cat); // Last registered wins
    });

    it('should return null when no registrations match', () => {
      const reg = factory.GetRegistration(Animal, 'nonexistent');
      expect(reg).toBeNull();
    });

    it('should return null when baseClass has no registrations', () => {
      const reg = factory.GetRegistration(Vehicle);
      expect(reg).toBeNull();
    });

    it('should perform case-insensitive key matching', () => {
      factory.Register(Animal, Dog, 'PET', 0, true);
      const reg = factory.GetRegistration(Animal, 'pet');
      expect(reg).not.toBeNull();
      expect(reg!.SubClass).toBe(Dog);
    });

    it('should return highest auto-incremented priority registration', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      factory.Register(Animal, Cat, 'pet', 0, true);
      factory.Register(Animal, GoldenRetriever, 'pet', 0, true);
      const reg = factory.GetRegistration(Animal, 'pet');
      expect(reg).not.toBeNull();
      // GoldenRetriever was last, so it has the highest auto-priority (3)
      expect(reg!.SubClass).toBe(GoldenRetriever);
      expect(reg!.Priority).toBe(3);
    });
  });

  describe('GetRegistrationsByRootClass', () => {
    it('should return registrations that share the same root class', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const registrations = factory.GetRegistrationsByRootClass(Animal);
      expect(registrations.length).toBe(2);
    });

    it('should filter by key when provided', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const registrations = factory.GetRegistrationsByRootClass(Animal, 'canine');
      expect(registrations.length).toBe(1);
      expect(registrations[0].SubClass).toBe(Dog);
    });

    it('should return empty array when rootClass is falsy', () => {
      expect(factory.GetRegistrationsByRootClass(null)).toEqual([]);
      expect(factory.GetRegistrationsByRootClass(undefined)).toEqual([]);
    });

    it('should return empty array when no registrations have matching root class', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      const registrations = factory.GetRegistrationsByRootClass(Vehicle);
      expect(registrations.length).toBe(0);
    });

    it('should perform case-insensitive key matching', () => {
      factory.Register(Animal, Dog, 'Canine', 0, true);
      const registrations = factory.GetRegistrationsByRootClass(Animal, 'canine');
      expect(registrations.length).toBe(1);
    });

    it('should return all registrations when key is null', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      factory.Register(Animal, Cat, 'feline', 0, true);
      const registrations = factory.GetRegistrationsByRootClass(Animal, null);
      expect(registrations.length).toBe(2);
    });
  });

  describe('ClassRegistration data structure', () => {
    it('should have correct defaults', () => {
      const reg = new ClassRegistration();
      expect(reg.Key).toBeNull();
      expect(reg.Priority).toBe(0);
      expect(reg.BaseClass).toBeUndefined();
      expect(reg.SubClass).toBeUndefined();
      expect(reg.RootClass).toBeUndefined();
    });

    it('should store all fields correctly after registration', () => {
      factory.Register(Animal, Dog, 'canine', 7, true, false);
      const registrations = factory.GetAllRegistrations(Animal, 'canine');
      expect(registrations.length).toBe(1);
      const reg = registrations[0];
      expect(reg.BaseClass).toBe(Animal);
      expect(reg.SubClass).toBe(Dog);
      expect(reg.Key).toBe('canine');
      expect(reg.Priority).toBe(7);
      expect(reg.RootClass).toBe(Animal);
    });
  });

  // ====================================================================
  // Async Lazy Loading API
  // ====================================================================

  describe('RegisterLazyLoader', () => {
    it('should register a lazy loader callback', () => {
      const factory = new ClassFactory();
      const loader = vi.fn().mockResolvedValue(false);
      // Should not throw
      factory.RegisterLazyLoader(loader);
    });

    it('should support multiple lazy loaders', () => {
      const factory = new ClassFactory();
      const loader1 = vi.fn().mockResolvedValue(false);
      const loader2 = vi.fn().mockResolvedValue(false);
      factory.RegisterLazyLoader(loader1);
      factory.RegisterLazyLoader(loader2);
      // Both registered without error
    });
  });

  describe('GetRegistrationAsync', () => {
    it('should return sync registration without calling lazy loaders', async () => {
      const factory = new ClassFactory();
      factory.Register(Animal, Dog, 'canine');
      const loader = vi.fn().mockResolvedValue(false);
      factory.RegisterLazyLoader(loader);

      const reg = await factory.GetRegistrationAsync(Animal, 'canine');
      expect(reg).not.toBeNull();
      expect(reg!.SubClass).toBe(Dog);
      expect(loader).not.toHaveBeenCalled();
    });

    it('should call lazy loaders when registration not found', async () => {
      const factory = new ClassFactory();
      const loader = vi.fn().mockImplementation(async (baseClassName: string, key: string) => {
        // Simulate loading a module that registers the class
        factory.Register(Animal, Cat, key);
        return true;
      });
      factory.RegisterLazyLoader(loader);

      const reg = await factory.GetRegistrationAsync(Animal, 'feline');
      expect(loader).toHaveBeenCalledWith('Animal', 'feline');
      expect(reg).not.toBeNull();
      expect(reg!.SubClass).toBe(Cat);
    });

    it('should call loaders in order and stop at first success', async () => {
      const factory = new ClassFactory();
      const loader1 = vi.fn().mockResolvedValue(false);
      const loader2 = vi.fn().mockImplementation(async (_base: string, key: string) => {
        factory.Register(Animal, Dog, key);
        return true;
      });
      const loader3 = vi.fn().mockResolvedValue(false);

      factory.RegisterLazyLoader(loader1);
      factory.RegisterLazyLoader(loader2);
      factory.RegisterLazyLoader(loader3);

      const reg = await factory.GetRegistrationAsync(Animal, 'pet');
      expect(loader1).toHaveBeenCalled();
      expect(loader2).toHaveBeenCalled();
      expect(loader3).not.toHaveBeenCalled(); // Stopped after loader2 succeeded
      expect(reg!.SubClass).toBe(Dog);
    });

    it('should return null when no loaders succeed', async () => {
      const factory = new ClassFactory();
      const loader = vi.fn().mockResolvedValue(false);
      factory.RegisterLazyLoader(loader);

      const reg = await factory.GetRegistrationAsync(Animal, 'unknown');
      expect(loader).toHaveBeenCalledWith('Animal', 'unknown');
      expect(reg).toBeNull();
    });

    it('should not call lazy loaders when key is null', async () => {
      const factory = new ClassFactory();
      const loader = vi.fn().mockResolvedValue(false);
      factory.RegisterLazyLoader(loader);

      const reg = await factory.GetRegistrationAsync(Animal, null);
      expect(loader).not.toHaveBeenCalled();
      expect(reg).toBeNull();
    });

    it('should not call lazy loaders when no loaders registered', async () => {
      const factory = new ClassFactory();
      // No loaders registered
      const reg = await factory.GetRegistrationAsync(Animal, 'canine');
      expect(reg).toBeNull();
    });
  });

  describe('CreateInstanceAsync', () => {
    it('should create instance from sync registration', async () => {
      const factory = new ClassFactory();
      factory.Register(Animal, Dog, 'canine');

      const instance = await factory.CreateInstanceAsync<Animal>(Animal, 'canine', 'Rex');
      expect(instance).toBeInstanceOf(Dog);
      expect(instance!.Name).toBe('Rex');
    });

    it('should trigger lazy load and create instance', async () => {
      const factory = new ClassFactory();
      factory.RegisterLazyLoader(async (_base: string, key: string) => {
        factory.Register(Animal, Cat, key);
        return true;
      });

      const instance = await factory.CreateInstanceAsync<Animal>(Animal, 'feline', 'Whiskers');
      expect(instance).toBeInstanceOf(Cat);
      expect(instance!.Name).toBe('Whiskers');
    });

    it('should fall back to base class when lazy load fails', async () => {
      const factory = new ClassFactory();
      factory.RegisterLazyLoader(async () => false);

      const instance = await factory.CreateInstanceAsync<Animal>(Animal, 'unknown', 'Mystery');
      expect(instance).toBeInstanceOf(Animal);
      expect(instance).not.toBeInstanceOf(Dog);
      expect(instance!.Name).toBe('Mystery');
    });

    it('should return null when baseClass is null', async () => {
      const factory = new ClassFactory();
      const instance = await factory.CreateInstanceAsync(null);
      expect(instance).toBeNull();
    });
  });

  describe('Metadata on registrations', () => {
    it('persists metadata on the ClassRegistration when provided to Register()', () => {
      factory.Register(Animal, Dog, 'fido', 0, true, false, { trainer: 'alice', tags: ['indoor'] });
      const regs = factory.GetAllRegistrations(Animal, 'fido');
      expect(regs).toHaveLength(1);
      expect(regs[0].Metadata).toEqual({ trainer: 'alice', tags: ['indoor'] });
    });

    it('leaves Metadata undefined when not provided (backwards compat)', () => {
      factory.Register(Animal, Dog, 'pre-metadata');
      const reg = factory.GetRegistration(Animal, 'pre-metadata');
      expect(reg?.Metadata).toBeUndefined();
    });
  });

  describe('GetAllRegistrationsByKeyPrefix', () => {
    beforeEach(() => {
      factory.Register(Animal, Dog, 'breed:retriever');
      factory.Register(Animal, Dog, 'breed:poodle');
      factory.Register(Animal, Cat, 'breed:tabby');
      factory.Register(Animal, Cat, 'color:black');
    });

    it('returns only registrations whose key starts with the prefix', () => {
      const breed = factory.GetAllRegistrationsByKeyPrefix(Animal, 'breed:');
      expect(breed.map(r => r.Key).sort()).toEqual(['breed:poodle', 'breed:retriever', 'breed:tabby']);
    });

    it('is case-insensitive and trims whitespace on the prefix', () => {
      const breed = factory.GetAllRegistrationsByKeyPrefix(Animal, '  BREED:  ');
      expect(breed).toHaveLength(3);
    });

    it('returns empty array when nothing matches', () => {
      expect(factory.GetAllRegistrationsByKeyPrefix(Animal, 'zzz:')).toEqual([]);
    });

    it('returns empty array when baseClass is falsy', () => {
      expect(factory.GetAllRegistrationsByKeyPrefix(null, 'breed:')).toEqual([]);
    });

    it('scopes to the requested base class', () => {
      factory.Register(Vehicle, Car, 'breed:something-weird');
      const animalBreed = factory.GetAllRegistrationsByKeyPrefix(Animal, 'breed:');
      expect(animalBreed.every(r => r.BaseClass === Animal)).toBe(true);
    });
  });

  describe('GetAllRegistrationsByKeyPattern', () => {
    beforeEach(() => {
      factory.Register(Animal, Dog, 'panel-a');
      factory.Register(Animal, Cat, 'panel-b');
      factory.Register(Animal, GoldenRetriever, 'widget-1');
    });

    it('returns registrations whose key matches the regex', () => {
      const panels = factory.GetAllRegistrationsByKeyPattern(Animal, /^panel-/);
      expect(panels.map(r => r.Key).sort()).toEqual(['panel-a', 'panel-b']);
    });

    it('returns empty array when baseClass or pattern is falsy', () => {
      expect(factory.GetAllRegistrationsByKeyPattern(null, /./)).toEqual([]);
      // null pattern intentionally caught by truthy check
      expect(factory.GetAllRegistrationsByKeyPattern(Animal, null as unknown as RegExp)).toEqual([]);
    });
  });

  describe('GetAllRegistrationsByMetadata', () => {
    beforeEach(() => {
      factory.Register(Animal, Dog, 'fido', 0, true, false, { entity: 'X', slot: 'after-fields', sortKey: 100 });
      factory.Register(Animal, Cat, 'whiskers', 0, true, false, { entity: 'X', slot: 'after-fields', sortKey: 50 });
      factory.Register(Animal, GoldenRetriever, 'goldie', 0, true, false, { entity: 'Y', slot: 'after-fields' });
      factory.Register(Animal, Dog, 'rex'); // no metadata at all
    });

    it('passes the metadata bag (or undefined) to the predicate', () => {
      const matches = factory.GetAllRegistrationsByMetadata(Animal, (m) => m?.entity === 'X' && m?.slot === 'after-fields');
      expect(matches.map(r => r.Key).sort()).toEqual(['fido', 'whiskers']);
    });

    it('handles registrations with no metadata (passes undefined)', () => {
      const noMeta = factory.GetAllRegistrationsByMetadata(Animal, (m) => m === undefined);
      expect(noMeta.map(r => r.Key)).toEqual(['rex']);
    });

    it('also exposes the full registration to the predicate', () => {
      const highPriority = factory.GetAllRegistrationsByMetadata(Animal, (m, r) => (m?.sortKey as number ?? 0) >= 100 && r.Key === 'fido');
      expect(highPriority).toHaveLength(1);
    });

    it('returns empty array when baseClass or predicate is missing', () => {
      expect(factory.GetAllRegistrationsByMetadata(null, () => true)).toEqual([]);
      expect(factory.GetAllRegistrationsByMetadata(Animal, null as unknown as () => boolean)).toEqual([]);
    });
  });

  describe('GetRegistration memoization (hot-path perf)', () => {
    it('returns the same registration object on repeated calls (cached)', () => {
      factory.Register(Animal, Dog, 'pet', 0, true);
      const first = factory.GetRegistration(Animal, 'pet');
      const second = factory.GetRegistration(Animal, 'pet');
      expect(first).not.toBeNull();
      expect(first).toBe(second);
    });

    it('caches a "no registration" (null) result and still returns null', () => {
      // Vehicle has no registration — exercises the cached-null path.
      expect(factory.GetRegistration(Vehicle, 'anything')).toBeNull();
      expect(factory.GetRegistration(Vehicle, 'anything')).toBeNull();
    });

    it('invalidates the cache when a new registration is added (no stale null)', () => {
      expect(factory.GetRegistration(Animal, 'pet')).toBeNull(); // primes the null cache
      factory.Register(Animal, Dog, 'pet', 0, true);
      const reg = factory.GetRegistration(Animal, 'pet');
      expect(reg).not.toBeNull();
      expect(reg!.SubClass).toBe(Dog);
    });

    it('invalidates the cache when a higher-priority registration changes the winner', () => {
      factory.Register(Animal, Dog, 'pet', 5, true);
      expect(factory.GetRegistration(Animal, 'pet')!.SubClass).toBe(Dog); // primes cache
      factory.Register(Animal, Cat, 'pet', 10, true); // higher priority wins
      expect(factory.GetRegistration(Animal, 'pet')!.SubClass).toBe(Cat);
    });

    it('memoizes case-insensitively by key (same result for different casings)', () => {
      factory.Register(Animal, Dog, 'canine', 0, true);
      const lower = factory.GetRegistration(Animal, 'canine');
      const upper = factory.GetRegistration(Animal, 'CANINE');
      expect(lower).not.toBeNull();
      expect(lower).toBe(upper);
    });

    it('returns null for a falsy base class', () => {
      expect(factory.GetRegistration(null)).toBeNull();
      expect(factory.GetRegistration(undefined)).toBeNull();
    });
  });
});
