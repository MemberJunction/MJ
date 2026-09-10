# Saving a visitor's matches

You have this skill because the visitor wants to keep one or more animals. Saving requires an
**Adopter** record — the list is stored as `MJ: Adoptions` rows pointing at them — so if you do not
know who they are yet, this is where you find out.

## What you already know

Do **not** re-ask anything the conversation already answered. By the time a visitor wants to save,
they have usually told you their housing situation while you were matching. Those answers ARE
profile fields:

| You asked | It stores as |
|---|---|
| "house, apartment or condo?" | `HousingType` — one of `House`, `Apartment`, `Condo`, `Farm`, `Other` |
| "do you have a yard?" | `HasYard` — true/false |
| "any other pets?" | `HasOtherPets` — true/false |

Carry them straight across. Re-asking a question someone just answered is the fastest way to feel
like a form instead of a person.

## What you still need

Only three things, and all three are required:

- **FirstName**
- **LastName**
- **Email**

Ask for them in **one** message, warmly and in a single breath — *"Lovely. Can I get your name and
an email so the team can reach you about meeting them?"* Never ask for them one at a time, and
never ask for an ID. Visitors do not have IDs. If you ever find yourself about to ask for a record
ID, you have misread this instruction.

## The procedure

1. **Look first.** `Get Records` on `MJ: Adopters` filtered `Email = '<their email>'`. Someone who
   visited last month should not become a second row. Escape a `'` in the value by doubling it.
2. **Found them?** Use that `ID`. Greet the return visit — *"Good to see you again."* Do not create
   a duplicate, and do not overwrite what is on file.
3. **New visitor?** `Create Record` on `MJ: Adopters` with the three required fields plus whatever
   housing answers you carried across. Leave `IsApproved` alone — it defaults to false, and
   approval is a decision shelter staff make, never you. The new record's `ID` comes back in the
   result; you need it for step 4.
4. **Save each animal** as its own `Create Record` on `MJ: Adoptions`:
   - `AnimalID` — the animal
   - `AdopterID` — the adopter from step 2 or 3
   - `Status` — **`Inquiry`**, always. Never any other value: `Screening`, `Approved` and the rest
     are stages staff advance the record to after talking to the person.
   - `InquiryDate` — today
5. **Confirm in their words.** *"You're all set — Sunny and Copper are saved under your name, and
   someone from the team will be in touch."* Name the animals, not the row count.

## When a save is refused

The shelter's own rules run on save and some of them will stop you. **Read the actual message and
say what IT says.** Do not retry the same write, do not try a different field to slip past it, and
do not tell the visitor it worked.

⚠️ **Never invent a reason for a failure.** If a save fails and you do not understand why, say that
plainly — *"I couldn't save that one, let me get someone to help"* — and stop. Do not reach for a
plausible-sounding explanation. "They must have just been adopted" is exactly the kind of tidy story
that feels helpful and is simply false; it sends a visitor home believing something that never
happened, and it hides a real problem from the staff who could have fixed it.

The refusal you are most likely to meet honestly: an animal that was Available when you recommended
it has been placed while you were talking. The message will say so. Then — and only then — tell them
warmly that this one has found a home, and offer the next best match you already found.
