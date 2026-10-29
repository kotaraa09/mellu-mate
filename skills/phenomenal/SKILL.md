---
name: phenomenal
description: Design a website or UI to the standard of award-winning sites - one strong idea, a signature moment, custom navigation, transitions and scroll motion, drawings or 3D where the brief calls for them, and craft in every detail - built fast, accessible and in this project's own direction, with an independent jury on the idea and the finished site. Use when the user asks for a standout, award-level, immersive or unforgettable site or screen.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Skill, Agent
---

# Phenomenal

Most sites are competent and forgettable. The few that win awards are not prettier: each one
is built around a single idea that belongs to its subject, and everything on the page, down
to the navigation and the way one section hands over to the next, serves that idea. This
skill finds the idea first, then builds it with the craft those sites show, then has someone
else judge it.

It picks no house style. A racing driver, a yerba mate brand and a museum archive must not
look alike, and none of them may look like the last site you built. The direction comes from
the subject, every time.

A competent site is a failure here. A clean hero photo, a good headline, tidy cards and a
working form score 6 or 7 from a jury. The difference between that and a Site of the Day is
the idea and the craft layer in step 8, and both are required, not optional.

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
3. **Everything is custom.** The navigation, the loader, the cursor, the section transitions
   and the page layout are designed for this site. Nothing looks like a template slot.
4. **Type as image.** Display type set very large, cropped, animated or set on a path. One
   distinctive display face with one quiet text face. Type carries the mood before any image
   loads.
5. **Motion with meaning.** Every movement says something: it reveals, connects, or shows
   cause and effect. Scroll drives the story: sections pin, images unmask, type moves at its
   own speed. One easing family across the whole site, nothing that moves only because it can.
6. **Depth.** 3D, a shader on the photographs, or layered planes moving at different speeds.
   The page feels like a space, not a document.
7. **Restraint.** Two or three colours, a strict grid broken on purpose, and a lot of empty
   space. The loud part is loud because the rest is quiet.
8. **Craft at the edges.** Hover states, focus rings, the 404 page, the footer, the copy on
   buttons. Judges open those, and so do users.

## Steps

### 1. Get the brief

Read the brief and everything that comes with it: copy, images, logos, menus, rubrics. In a
project, also read `docs/PRD.md`, `docs/STATE.md` and `design/tokens.md` if they exist.

When the brief says who visits, what they must do, and what the site must contain, ask
nothing: make every choice yourself and record it. Only when one of those three is missing,
ask for it, in one message.

Ambition: an award-level request means **rich** (scroll choreography, transitions) or
**immersive** (3D or WebGL). Build **calm** (HTML and CSS, little motion) only when the user
asks for it. Immersive costs more time and needs a fallback for slow phones.

### 2. Find the idea

Write five ideas quickly, then cut them to three. Reject an idea when:

- **The brief names it.** If the brief offers examples ("a dusk-to-night control", "an
  interactive specimen"), every other entrant reads the same examples and builds them. An
  example in the brief is the starting line, not an idea.
- **It fits any brand.** "Smooth scroll with fading sections" is not an idea.
- **It is a device, not an idea.** A clock, a progress bar or a counter in the header is
  a device. Keep a device only when the idea needs it (see step 8).

For each of the three, write one line each for:

- The idea.
- The signature moment.
- The navigation: how a visitor moves around, designed for this idea.
- The transition: how one section hands over to the next.
- What moves on scroll.
- Why it belongs to this subject and to no other.

### 3. Have the ideas judged before you build

The score is won or lost at the idea. A reviewer after the build can only polish; it cannot
replace a weak idea, and fix rounds after the build do not move the score. So the jury sees
the ideas first, while changing them costs nothing.

Read `reference/jury.md` next to this skill, and start a reviewer with the Agent tool using
its **idea review** prompt. Give it the brief and your three ideas, written as above. It
returns a score out of 10 for each, the faults it sees, and how the best one could be
stronger.

Take the best idea and apply the reviewer's changes. If no idea scores 8 or more, write
three new ones and have a new reviewer judge them. Stop after two rounds and take the best.

If the brief is complete, carry on without asking. List all three ideas in your final
report, with the reviewer's scores and the reason for the pick. If the user is in the
conversation and the brief is thin, show them the judged ideas and wait for their pick.

### 4. Set the system

Write the direction into `design/tokens.md` (create it if the project has none), so the next
session keeps it:

- The idea and the signature moment, one line each.
- Type: the display face, the text face, and the scale. Check each font's licence for web use.
- Readability: the display face only at 32px and above. Text, labels, numbers in forms and
  anything a visitor must read to act use the text face, at 16px or more. No italic, condensed
  or display face below 24px. A face that looks good in the hero and hard to read in a price
  or a time fails here.
- Colour: two or three, each with its job, and the contrast pairs that pass WCAG AA.
- Grid and spacing, and where the grid breaks on purpose.
- Motion: one easing curve, three durations, and what each kind of movement means.
- Sound, only if the idea needs it: off until the user turns it on.

### 5. Pick the tools for the ambition

- **Calm:** HTML and CSS. Use scroll-driven animations, view transitions and `@property`.
- **Rich:** Motion (MIT) or GSAP with ScrollTrigger (free, with its own licence, not open
  source), and Lenis (MIT) for smooth scroll.
- **Immersive:** add Three.js (MIT), or React Three Fiber in a React project, or OGL for a
  small scene. A fragment shader on the supplied photographs (a light reveal, a ripple, a
  displacement on hover) often gives depth without building a 3D scene.

Run `/mellu:pick-library` before you install anything new, and fit the project's existing
stack instead of adding a second one.

### 6. Write the words

Words the user gave for the site, such as a tagline, a description or a product text, go on
the page exactly as given. Do not edit them, and do not run anything over them.

Write every other line yourself: the headline, the tagline, section text, button labels,
the 404 page, the footer. Write them for the idea from step 2, in the subject's own voice,
with real details from the brief instead of general praise.

Then load the `humanizer` skill and run it over every line you wrote, and only those lines.
Put the rewritten lines in the page. Copy that sounds written by AI breaks the idea faster
than any visual fault.

### 7. Build the signature moment first

Build the one moment as a working slice before the rest of the site: real content, real
type, real motion. Open it in the browser, use it, and take screenshots.

**Cause and effect stay in view together.** When a control changes something (a slider, a
dial, a toggle, a scrubber), the control and the thing it changes must be on screen at the
same time, on desktop and at phone width. Pin the result while the visitor uses the
control, or put the control inside the result. A slider at the bottom of a section that
changes an image the visitor scrolled past is broken, however good each half looks.

If the moment does not land, the rest of the site will not save it, so fix it here or go
back to step 2.

### 8. Build the craft layer

Build the rest of the site with every item below, each designed for this idea. These are what
separate a Site of the Day from a good site.

- **Custom navigation.** Not a logo on the left, links on the right and a pill button. Design
  how a visitor finds their way for this idea: a full-screen menu with its own transition, a
  navigation that is part of the scene, an index, a dial. Keep the main call to action one
  tap away at every scroll position.
- **An opening sequence.** The first two seconds are choreographed: type, image and
  navigation arrive in an order that tells the idea. A loader, if any, is the first scene.
- **A hero built from the idea.** Not a full-bleed photo with a headline and two buttons.
  Compose it: crop, layer, split, mask or animate the material into something only this
  site has.
- **Section transitions.** Each section hands over to the next: a pin, a mask reveal, a
  colour change, an image that grows into the next section. No hard cuts between bands.
- **Scroll choreography.** At least two pinned or scrubbed sequences, where scroll position
  drives what happens, not just triggers a fade.
- **Arrangement.** No two sections in a row share a layout. At least one composition breaks
  the grid on purpose: overlap, offset, type over image, a full-bleed break. Vary the
  density: some sections dense, some almost empty.
- **Micro-interactions.** Every link, card, image and button responds to hover and press in
  the site's own way. A custom cursor only if it carries meaning.
- **Depth, where the page needs it.** Section transitions and scroll choreography already
  give the page some depth. Add more only in the ways the next list allows.

The items below are not a checklist. Each one is worth its cost only when the brief gives it
a reason. Go through them, and for each one decide yes or no from the brief, and write one
line on why in your notes. Using all of them is as generic as using none.

- **Elements beyond what was supplied.** Supplied photographs and logos are the base, not
  always the whole kit. When the idea needs more:
  - An icon set drawn for the site in SVG, in one stroke weight that matches the type. Use a
    library such as Phosphor Icons (MIT) only for plain interface icons (close, arrow,
    menu), restyled to match.
  - A drawn layer: line illustrations, technical drawings, a map or plan, hand-drawn marks,
    a pattern from the subject. SVG, so it can draw itself on scroll.
  - Extra images: run `/mellu:generate-asset` if a provider key is set up, or use free
    stock (Unsplash or Pexels licences) and record each source. When the brief says to use
    only the supplied material, keep to it and make the rest in code.
- **3D, when the subject has a shape worth turning.** A product people want to see from
  every side (a 360-degree view), a space people will visit or buy (property, a condo, a
  hotel room, a venue), an object whose making matters, or a portfolio of 3D work. Build it
  in Three.js (MIT), and give it a still fallback when WebGL is missing or the device is
  slow. A 3D scene with no reason in the brief is decoration, and it costs load time.
- **Perspective and scale, when they say something.** Photographs as planes the camera moves
  through, CSS 3D transforms, layers at different depths, a zoom from a detail to the whole.
  Use them when the story is about a place, a size or a process.
- **Ambient motion, when the subject is alive.** Slow motion between scroll events: drifting
  particles, flickering light, leaves that sway, a gentle camera drift. Quiet enough to read
  over, and off under reduced motion. A calm, precise brand may need stillness instead.
- **Persistent elements earn their place.** Anything that stays on screen, such as a readout
  in the header, a progress line or a floating menu, must show something the visitor needs,
  and must be exact. If it only decorates, or tracks the scroll loosely, cut it. A device
  that suited one project usually does not suit the next.
- **Floating elements read over anything and cover nothing.** Give a floating element its
  own backing, such as a translucent panel with a background blur or a solid card, so it
  stays legible over photographs and text. Place it where it never covers a heading, a
  button or the main task, and check this at every scroll position.

### 9. Polish pass

Check each item in the browser, on desktop and at phone width:

- Every interactive element has a hover, a focus and a pressed state.
- Motion uses the easing and durations from step 4, and nothing else.
- Type does not overflow, widow or clash at any width, and every small text is easy to read.
- No letter is cut off. Text revealed through a mask or a box with `overflow: hidden` loses
  the tails of g, j, p and y, and the tops of accents, when the line height is tight. Give
  the mask room below the baseline, and check every masked headline.
- The first screen shows the headline and the main action within two seconds, with no
  scroll or tap, on desktop and on a phone.
- No floating element covers a heading, a button or the main task at any scroll position.
- The loader, the 404 page and the footer belong to the idea.
- The main task (booking, buying, contacting) works from start to end, including empty and
  wrong input.
- Nothing on the page could be on any other brand's site.

### 10. Independent jury

You built the page, so you will score it too kindly. Someone else scores it.

1. Serve the site and capture screenshots into a `review/` folder next to it: desktop at
   1440px and phone at 390px, one per section; the signature moment before, during and
   after use; each step of the main task; the menu open; the 404 page.
2. Read `reference/jury.md` next to this skill, and start a reviewer with the Agent tool
   using its **site review** prompt. Give it the brief, the `review/` folder and the site's
   folder. Do not give it your rationale, your notes or this conversation.
3. Fix every item on the reviewer's list, in order, and check each fix in the browser.
   There is one review round. A second round costs as much as the first and, in testing,
   did not raise the score: the idea review in step 3 is where the score moves.

The site passes when the reviewer scores Design 8 or more, no other part below 7.5, and a
weighted total of 8 or more.

End your report with the reviewer's table: each part, its score, its evidence, and the
total. If the brief has its own rubric, add the reviewer's scores for it too. Then list the
fixes you made after the review, which the score does not yet include. If the site did not
pass, say so plainly and name what still holds it back.

## Rules that do not bend

Awards are lost on these, and users are lost faster.

- **`prefers-reduced-motion` turns the motion down**, and the site still makes sense with it.
- **The content is in the HTML.** Text in a canvas or a WebGL scene is also in the page, so
  search engines and screen readers can read it.
- **Keyboard works everywhere**, including the signature moment and the custom navigation.
- **Scroll stays the user's.** Smooth scroll and pinned sections are fine; trapping the
  scroll, breaking the back button or breaking links to a section is not.
- **Fast.** Largest Contentful Paint under 2.5 seconds on a mid-range phone. Use the smallest
  image files supplied, or convert to WebP or AVIF. A loader may last 2 seconds at most and
  shows real progress. Heavy 3D loads after the first screen.
- **A fallback for weak devices.** Without WebGL, or on a slow phone, show a still or a
  video of the moment instead of a blank space.
- **Contrast passes WCAG AA** for all text, including text over images and video.

## Signs of a generic design

If the page shows any of these, the idea or the craft layer is missing. Go back.

- A full-bleed photo with a headline, a subline and two buttons, then three cards.
- A logo on the left, links on the right and a pill button, on every site you build.
- Every section the same band: label, heading, paragraph, image on one side.
- Every section fades up the same way as you scroll.
- Purple-to-blue gradients, glass panels on everything, and glowing blobs with no reason.
- The supplied assets placed in boxes, when the idea needed a drawing, an icon set or 3D.
- 3D, particles or parallax with no reason in the brief.
- One sans-serif face for everything, at safe sizes.
- Stock icons in circles, and copy such as "Unlock the power of".
