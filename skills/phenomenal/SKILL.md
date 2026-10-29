---
name: phenomenal
description: Design a website or UI to the standard of award-winning sites - one strong idea, a signature moment, type and motion with intent, and craft in every detail - built fast, accessible and in this project's own direction. Use when the user asks for a standout, award-level, immersive or unforgettable site or screen.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Skill
---

# Phenomenal

Most sites are competent and forgettable. The few that win awards are not prettier: each one
is built around a single idea that belongs to its subject, and everything on the page serves
that idea. This skill finds the idea first, then builds it with the craft those sites show.

It picks no house style. A racing driver, a yerba mate brand and a museum archive must not
look alike, and none of them may look like the last site you built. The direction comes from
the subject, every time.

## What the top sites share

Studied from sites such as landonorris.com, messenger.abeto.co, igloo.inc, lusion.co,
dontboardme.com, en.manayerbamate.com and persepolis.getty.edu. Learn the principle from
them. Never copy a layout, an asset, a font pairing or a signature effect: a site that
looks like igloo.inc is a copy, not an award.

1. **One idea, owned by the subject.** Persepolis is an archive you walk through, because the
   subject is a place. Messenger is a tiny world you deliver letters across. The idea is a
   sentence anyone can repeat, and it comes from the brand, the product or the story, never
   from a trend.
2. **A signature moment.** One interaction people talk about afterwards: a helmet that turns
   with the cursor, a scroll that travels through ice, a product that builds itself. One
   moment, done fully, beats ten effects done halfway.
3. **Type as image.** Display type set very large, cropped, animated or set on a path. One
   distinctive display face with one quiet text face. Type carries the mood before any image
   loads.
4. **Motion with meaning.** Every movement says something: it reveals, connects, or shows
   cause and effect. One easing family across the whole site, durations from a small set,
   nothing that moves only because it can.
5. **Transitions as storytelling.** Pages and sections hand over to each other instead of
   cutting. The loader, when there is one, is the first scene of the story, not a spinner.
6. **Restraint.** Two or three colours, a strict grid broken on purpose, and a lot of empty
   space. The loud part is loud because the rest is quiet.
7. **Craft at the edges.** Hover states, the cursor, focus rings, the 404 page, the footer,
   the copy on buttons. Judges open those, and so do users.

## Steps

### 1. Get the brief

Read `docs/PRD.md`, `docs/STATE.md` and `design/tokens.md` if they exist. Then make sure you
know three things. Ask only for the ones you cannot find, in one message:

- Who visits, and what they must do or feel before they leave.
- The subject's own material: product, story, place, people, history, sound.
- The ambition, in plain words: **calm** (fast, almost no extra code), **rich** (scroll and
  motion work), or **immersive** (3D or WebGL). Recommend one. Immersive costs days, not
  hours, and needs a fallback for slow phones.

### 2. Find the idea

Write three ideas. For each one give:

- The idea in one sentence.
- The signature moment in one sentence.
- Why it belongs to this subject and to no other.

The three must differ in kind, not in colour. Recommend one, and wait for the user to pick.
Do not build before they pick: the idea is the whole site, and a wrong one wastes every
step after it.

Reject an idea that fits any brand. "Smooth scroll with fading sections" is not an idea.

### 3. Set the system

Write the direction into `design/tokens.md` (create it if the project has none), so the next
session keeps it:

- The idea and the signature moment, one line each.
- Type: the display face, the text face, and the scale. Check each font's licence for web use.
- Colour: two or three, each with its job, and the contrast pairs that pass WCAG AA.
- Grid and spacing, and where the grid breaks on purpose.
- Motion: one easing curve, three durations, and what each kind of movement means.
- Sound, only if the idea needs it: off until the user turns it on.

### 4. Pick the tools for the ambition

- **Calm:** HTML and CSS. Use scroll-driven animations, view transitions and
  `@property` before any library.
- **Rich:** add GSAP with ScrollTrigger and a smooth-scroll library such as Lenis.
- **Immersive:** add Three.js, or React Three Fiber in a React project, or OGL when the scene
  is small. Write shaders only for what a texture or a model cannot do.

Run `/mellu:pick-library` before you install anything new, and fit the project's existing
stack instead of adding a second one.

### 5. Write the words

Words the user gave for the site, such as a tagline, a description or a product text, go on
the page exactly as given. Do not edit them, and do not run anything over them.

Write every other line yourself: the headline, the tagline, section text, button labels,
the 404 page, the footer. Write them for the idea from step 2, in the subject's own voice,
with real details from the brief instead of general praise.

Then load the `humanizer` skill and run it over every line you wrote, and only those lines.
Put the rewritten lines in the page. Copy that sounds written by AI breaks the idea faster
than any visual fault.

### 6. Build the signature moment first

Build the one moment as a working slice before the rest of the site: real content, real
type, real motion. Open it in the browser, take a screenshot, and show the user. If the
moment does not land, the rest of the site will not save it, so fix it here or go back to
step 2.

Then build outward: the hero, the sections, the transitions, the small details.

### 7. Polish pass

Check each item in the browser, on desktop and at phone width:

- Every interactive element has a hover, a focus and a pressed state.
- Motion uses the easing and durations from step 3, and nothing else.
- Type does not overflow, widow or clash at any width.
- The loader, the 404 page and the footer belong to the idea.
- Nothing on the page could be on any other brand's site.

### 8. Score it as an Awwwards jury would

Score the page the way the Awwwards jury scores a Site of the Day, from 1 to 10 for each
part, with the weight it carries:

| Part | Weight | What earns a high score |
|---|---|---|
| Design | 40% | Type, colour, layout and imagery that feel made for this subject alone |
| Usability | 30% | Clear paths, fast loads, works on a phone and with a keyboard |
| Creativity | 20% | An idea and a signature moment no other site has |
| Content | 10% | Words and visuals that tell the story, with no filler |

Score from what is on the screen, not from what you meant to build. Take fresh screenshots
on desktop and at phone width, scroll the whole page, and use the signature moment. For
each part, write the score and one line of evidence a juror would point to. Use half
points, and when you are between two scores, take the lower one: you built this page, so
you will want to round up.

If Design scores below 8, or the weighted total is below 8, fix the weakest things the
evidence names, then take new screenshots and score again. Stop after three rounds. If it
still scores below 8, say so plainly and name what holds it back.

End your report with the final table: each part, its score, its evidence, and the total.

## Rules that do not bend

Awards are lost on these, and users are lost faster.

- **`prefers-reduced-motion` turns the motion down**, and the site still makes sense with it.
- **The content is in the HTML.** Text in a canvas or a WebGL scene is also in the page, so
  search engines and screen readers can read it.
- **Keyboard works everywhere**, including the signature moment.
- **Scroll stays the user's.** Smooth scroll is fine; trapping the scroll, breaking the back
  button or breaking links to a section is not.
- **Fast.** Largest Contentful Paint under 2.5 seconds on a mid-range phone. A loader may
  last 2 seconds at most, and shows real progress. Heavy 3D loads after the first screen.
- **A fallback for weak devices.** Without WebGL, or on a slow phone, show a still or a
  video of the moment instead of a blank space.
- **Contrast passes WCAG AA** for all text, including text over images and video.

## Signs of a generic AI design

If the page shows any of these, the idea is missing. Go back to step 2.

- A centred hero with a gradient, a headline, a subline and two buttons, then three cards.
- Purple-to-blue gradients, glass panels, and glowing blobs with no reason.
- One sans-serif face for everything, at safe sizes.
- Every section fades up the same way as you scroll.
- Stock icons in circles, and copy such as "Unlock the power of".
