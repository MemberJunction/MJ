# Form chrome

How a generated entity form decides **layout** (accordion vs left rail) and
**which related sections appear** (Primary vs More vs not at all).

The model is documented in
[Forms Architecture §7d](../guides/FORMS_ARCHITECTURE_GUIDE.md#7d-form-chrome--accordion-left-nav-and-more).

Implementation notes for the layering stack (L0 CodeGen → L1 inclusion →
L2 ranker → L3 `MJ: Form Chrome Rules` → L4 user order) live in
[`form-chrome-layering.md`](form-chrome-layering.md).
