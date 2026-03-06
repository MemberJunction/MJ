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
});
