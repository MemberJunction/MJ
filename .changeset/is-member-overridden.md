---
"@memberjunction/global": minor
---

Add `IsMemberOverridden(instance, member, BaseClassRef)` to `ClassUtils`.

Answers whether a subclass replaced a member somewhere between an instance and a given base class,
which is what distinguishes "the author made no choice" from "the author chose the value that
happens to be the default" — something a base-class member cannot express on its own. An API whose
default sits in the *off* position therefore silently disables exactly the subclasses that most
wanted it on.

Handles methods and accessors alike by comparing property descriptors, finds an override declared
anywhere in a multi-level chain, returns false rather than throwing on bad input, and caches per
(class, member, base class) so a hot path does not re-walk a prototype chain.

Used by `BaseEntity` to decide whether to run an overridden `ValidateAsync`.
