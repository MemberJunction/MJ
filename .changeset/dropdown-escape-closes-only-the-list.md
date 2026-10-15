---
"@memberjunction/ng-ui-components": patch
---

`mj-dropdown`: Escape with the list open closes the list and goes no further (#5340). The key used to reach the page as well, so a host that closes on Escape (an `mj-dialog`, a popover, the realtime call's voice picker) closed along with the list. The field and the filter box now stop the key once they close the list, and the dropdown handles Escape on its overlay itself instead of the CDK's close, which let the key through, so the rule holds when focus has left the field (after a click inside the panel). Focus returns to the field. With the list closed, Escape reaches the host as before.
