import { 
    GetSuperclass, 
    GetRootClass, 
    IsSubclassOf, 
    IsRootClass,
    IsDescendantClassOf,
    GetClassInheritance,
    GetFullClassHierarchy,
    IsClassConstructor,
    GetClassName 
} from '../ClassUtils';

// Test class hierarchy
class Animal {
    name: string = '';
}

class Mammal extends Animal {
    furColor: string = '';
}

class Dog extends Mammal {
    breed: string = '';
}

class GoldenRetriever extends Dog {
    temperament: string = 'friendly';
}

// Test cases
describe('ClassUtils', () => {
    describe('GetSuperclass', () => {
        it('should return immediate superclass', () => {
            expect(GetSuperclass(GoldenRetriever)).toBe(Dog);
            expect(GetSuperclass(Dog)).toBe(Mammal);
            expect(GetSuperclass(Mammal)).toBe(Animal);
            expect(GetSuperclass(Animal)).toBe(null);
        });

        it('should handle invalid inputs', () => {
            expect(GetSuperclass(null)).toBe(null);
            expect(GetSuperclass(undefined)).toBe(null);
            expect(GetSuperclass({})).toBe(null);
            expect(GetSuperclass('not a class')).toBe(null);
        });
    });

    describe('GetRootClass', () => {
        it('should return the root class', () => {
            expect(GetRootClass(GoldenRetriever)).toBe(Animal);
            expect(GetRootClass(Dog)).toBe(Animal);
            expect(GetRootClass(Animal)).toBe(Animal);
        });

        it('should handle classes without inheritance', () => {
            class Standalone {}
            expect(GetRootClass(Standalone)).toBe(Standalone);
        });
    });

    describe('IsSubclassOf', () => {
        it('should correctly identify subclass relationships', () => {
            expect(IsSubclassOf(GoldenRetriever, Dog)).toBe(true);
            expect(IsSubclassOf(GoldenRetriever, Mammal)).toBe(true);
            expect(IsSubclassOf(GoldenRetriever, Animal)).toBe(true);
            expect(IsSubclassOf(Dog, Animal)).toBe(true);
        });

        it('should return false for non-subclass relationships', () => {
            expect(IsSubclassOf(Animal, Dog)).toBe(false);
            expect(IsSubclassOf(Dog, GoldenRetriever)).toBe(false);
            expect(IsSubclassOf(Dog, Dog)).toBe(false); // Not a subclass of itself
        });

        it('should handle invalid inputs', () => {
            expect(IsSubclassOf(null, Animal)).toBe(false);
            expect(IsSubclassOf(Dog, null)).toBe(false);
            expect(IsSubclassOf('not a class', Animal)).toBe(false);
        });
    });

    describe('IsRootClass', () => {
        it('should identify root classes', () => {
            expect(IsRootClass(Animal)).toBe(true);
            class StandaloneClass {}
            expect(IsRootClass(StandaloneClass)).toBe(true);
        });

        it('should return false for classes with superclasses', () => {
            expect(IsRootClass(GoldenRetriever)).toBe(false);
            expect(IsRootClass(Dog)).toBe(false);
            expect(IsRootClass(Mammal)).toBe(false);
        });

        it('should handle invalid inputs', () => {
            expect(IsRootClass(null)).toBe(false);
            expect(IsRootClass(undefined)).toBe(false);
            expect(IsRootClass(42)).toBe(false);
            expect(IsRootClass('string')).toBe(false);
            expect(IsRootClass({})).toBe(false);
        });
    });

    describe('IsDescendantClassOf', () => {
        it('should work identically to IsSubclassOf', () => {
            // Test direct parent
            expect(IsDescendantClassOf(GoldenRetriever, Dog)).toBe(true);
            expect(IsDescendantClassOf(Dog, Mammal)).toBe(true);
            
            // Test grandparent and beyond
            expect(IsDescendantClassOf(GoldenRetriever, Mammal)).toBe(true);
            expect(IsDescendantClassOf(GoldenRetriever, Animal)).toBe(true);
            
            // Test non-relationships
            expect(IsDescendantClassOf(Animal, GoldenRetriever)).toBe(false);
            expect(IsDescendantClassOf(Dog, Dog)).toBe(false);
        });
    });

    describe('GetClassInheritance', () => {
        it('should return inheritance chain', () => {
            const chain = GetClassInheritance(GoldenRetriever);
            expect(chain.length).toBe(3);
            expect(chain[0].name).toBe('Dog');
            expect(chain[0].reference).toBe(Dog);
            expect(chain[1].name).toBe('Mammal');
            expect(chain[1].reference).toBe(Mammal);
            expect(chain[2].name).toBe('Animal');
            expect(chain[2].reference).toBe(Animal);
        });

        it('should return empty array for base classes', () => {
            const chain = GetClassInheritance(Animal);
            expect(chain.length).toBe(0);
        });
    });

    describe('GetFullClassHierarchy', () => {
        it('should include the class itself', () => {
            const hierarchy = GetFullClassHierarchy(GoldenRetriever);
            expect(hierarchy.length).toBe(4);
            expect(hierarchy[0].name).toBe('GoldenRetriever');
            expect(hierarchy[0].reference).toBe(GoldenRetriever);
            expect(hierarchy[1].name).toBe('Dog');
            expect(hierarchy[2].name).toBe('Mammal');
            expect(hierarchy[3].name).toBe('Animal');
        });
    });

    describe('IsClassConstructor', () => {
        it('should identify class constructors', () => {
            expect(IsClassConstructor(Animal)).toBe(true);
            expect(IsClassConstructor(GoldenRetriever)).toBe(true);
        });

        it('should reject non-constructors', () => {
            expect(IsClassConstructor(() => {})).toBe(false);
            expect(IsClassConstructor(function regularFunction() {})).toBe(false);
            expect(IsClassConstructor(42)).toBe(false);
            expect(IsClassConstructor('string')).toBe(false);
            expect(IsClassConstructor({})).toBe(false);
        });

        it('should handle constructor functions', () => {
            function OldStyleClass() {
                this.property = 'value';
            }
            OldStyleClass.prototype.method = function() {};
            
            expect(IsClassConstructor(OldStyleClass)).toBe(true);
        });
    });

    describe('GetClassName', () => {
        it('should get class names', () => {
            expect(GetClassName(Animal)).toBe('Animal');
            expect(GetClassName(GoldenRetriever)).toBe('GoldenRetriever');
        });

        it('should handle anonymous classes', () => {
            const AnonClass = class {};
            // Note: This might return 'AnonClass' or 'Anonymous' depending on environment
            const name = GetClassName(AnonClass);
            expect(['AnonClass', 'Anonymous'].includes(name)).toBe(true);
        });

        it('should handle invalid inputs', () => {
            expect(GetClassName(null)).toBe('Unknown');
            expect(GetClassName(undefined)).toBe('Unknown');
            expect(GetClassName(42)).toBe('Unknown');
        });
    });
});