//import { ContactBaseEntity } from "../generated/entity_subclasses";
import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";


// STUB base class-  you would DELETE this and use a real base class from ../generated/entity_subclasses instead
class ContactBaseEntityStub extends BaseEntity {
    get FirstName(): string {
        return "";        
    }
    set FirstName(value: string) {
    }
}

// Super simple example of a sub-class for an example Contacts entity  doesn't do anything but you can see here you can do stuff with sub-class overrides
// Also, important, if you're going to override the getter/setter for a property, you MUST call super.propertyName in the getter/setter AND you must also
// override BOTH the getter and setter, otherwise you'll get a runtime error! This is because the getter/setter is actually a single property on the object
@RegisterClass(BaseEntity, 'Contacts', 1)
export class ContactDemoEntity extends ContactBaseEntityStub /*here you would change this to sub-class the real base class from ../generated/entity_subclasses */  {
    get FirstName(): string {
        console.log("I'm getting the FirstName property from the sub-class!")
        return super.FirstName;
    }
    set FirstName(value: string) {
        super.FirstName = value;
        console.log("I'm setting the FirstName property from the sub-class!")
    }
} 