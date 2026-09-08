---
"@memberjunction/ng-base-forms": patch
---

fix(ng-base-forms): when a date field holds a value the date editor cannot display, show a warning beside the empty input instead of a blank box that reads as "no date". Previously an unreadable stored value looked identical to an empty field, and saving the record silently wrote NULL over it.
