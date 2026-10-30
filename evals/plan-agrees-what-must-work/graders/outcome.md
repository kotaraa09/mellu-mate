---
type: llm
focus: last_message
---

The reply plans the feature before building it. All of these must hold:

- It lists, in plain words, what the user or a shopper will be able to do or see when the
  feature is done, as separate short lines or options.
- One of those lines says a sold-out plant cannot be bought: it is refused in the cart or at
  checkout, not only labelled on the page.
- It marks at least one line as a guess or as something the user did not ask for, or asks the
  user which of the lines they want.
- It asks the user to agree to or choose from those lines before building.

Extra text is fine: the session opener lines (Now, Next, Blocked, Debt) at the top, and other
questions about the feature.

Fail if the reply builds the feature, or lists only what the page shows with no refusal.
