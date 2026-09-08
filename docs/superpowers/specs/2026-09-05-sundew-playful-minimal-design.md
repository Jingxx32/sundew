# Sundew Playful Minimal UI — Visual Design Specification

Date: 2026-09-05  
Status: Approved visual direction; implementation pending

## 1. Purpose and boundaries

Sundew is an AI-powered French-learning assistant for active output,
personalised practice, memory, and recurring-error correction. The interface
should feel like a quiet expert: focused and capable first, with a small,
organic sense of delight.

This is a visual refinement of the existing application. It must preserve:

- routes, information architecture, features, learning logic, data flow, and API behaviour;
- the existing reading, writing, vocabulary, quiz, speaking, progress, and TCF flows;
- the final Sundew logo geometry.

It must not introduce a new product structure, a new mascot, generic AI
visuals, or decoration that competes with study content.

This specification supersedes the **visual** decisions in
`../../archive/specs/2026-09-03-modern-minimal-ui-design.md`: the page background returns to warm
cream and French Blue returns as the primary interaction colour. The previous
document remains useful as implementation history only.

## 2. Design thesis

**80% precise product interface; 20% playful organic brand.**

Sundew should not read as an AI startup, a children's education app, a
traditional classroom product, or a dense SaaS dashboard. The memorable
element is not a decorative illustration: it is the contrast between a calm,
well-spaced study surface and one subtle pale-blue organic field at the edge
of low-density moments.

The user's task always wins over the brand. A learner reading a passage,
listening to audio, or choosing an answer should encounter an almost silent
interface. A learner arriving for the day, completing a milestone, or meeting
an empty state can encounter more warmth and personality.

## 3. Visual tokens

Implement these as semantic CSS tokens in `src/app/globals.css`; components
must consume semantic token utilities instead of raw hex values.

### Surfaces and ink

| Token | Value | Use |
|---|---:|---|
| `--background` | `#FBF8F1` | Warm cream application canvas |
| `--surface` | `#FFFFFF` | Primary cards, dialogs, answer areas |
| `--surface-muted` | `#F5F7FA` | Secondary cards, inactive controls |
| `--surface-blue` | `#EAF3FF` | Focus modules and quiet blue panels |
| `--border` | `#E8E4DC` | Low-contrast separation only |
| `--foreground` | `#0D1B3D` | Primary text, headings, answer text |
| `--muted-foreground` | `#5D6B85` | Supporting copy and metadata |
| `--subtle-foreground` | `#7C899F` | Decorative, nonessential labels only |

### Brand and semantic colour

| Token | Value | Use |
|---|---:|---|
| `--primary` | `#1F63D5` | Main actions, selected navigation, active progress |
| `--primary-hover` | `#164EAF` | Hover/pressed primary action |
| `--primary-foreground` | `#FFFFFF` | Text on primary actions |
| `--accent` | `#1F63D5` | Links and focus treatment; aliases primary where existing code expects accent |
| `--accent-soft` | `#EAF3FF` | Selected/active backgrounds |
| `--accent-soft-strong` | `#D8E9FF` | Stronger selected backgrounds |
| `--focus-star` | `#F04B48` | Recurring-error, review-needed, today's meaningful focus |
| `--focus-star-soft` | `#FFF0EF` | Background behind a red-star status |
| `--success` | `#16845B` | Stable/mastered only |
| `--success-soft` | `#EAF8F1` | Stable/mastered background |
| `--warning` | `#C87816` | In-progress/caution only |
| `--warning-soft` | `#FFF6E7` | In-progress/caution background |
| `--danger` | `#D94343` | Errors and destructive actions |
| `--danger-soft` | `#FFF0EF` | Error background |

The red `--focus-star` is not a secondary CTA colour. It appears only when
the application has identified something to remember, review, or revisit.
Never use it as generic visual confetti, a default notification dot, or a
button fill.

### Type

Keep the installed fonts rather than adding a decorative family:

- **Interface, headings, labels, and data:** Inter. Tight, confident headings
  (`font-weight: 700`, modest negative tracking) are the product voice.
- **Long-form reading only:** Source Serif 4 via `.reading-prose`. It supports
  sustained French reading without making the application shell academic.
- **Technical/data values:** Source Code Pro only where monospaced alignment
  genuinely helps (IDs, timestamps, code-like values), not as decoration.

Headings are functional signposts, not editorial display type. Avoid all caps
except compact section labels and keyboard-oriented control labels.

### Shape, border, and elevation

| Element | Radius | Border / shadow |
|---|---:|---|
| Buttons, inputs, chips | 10px | 1px border when inactive; no heavy shadow |
| Standard cards | 14px | `1px solid var(--border)` or a faint 1–2 layer shadow, never both strongly |
| Primary focus cards | 18px | Pale-blue fill; no hard border needed |
| Dialogs and major panels | 20px | White surface, restrained shadow |

Use shadows only to establish layer boundaries (dialog over page, floating
control over content). Cards should normally be separated by surface contrast,
spacing, or a hairline border—not by repeated floating shadows.

## 4. Layout and density

### Shared shell

- The sidebar is a quiet navigation rail: white/light surface, a compact bold
  Sundew icon/wordmark at the top, clear active row in `--accent-soft`, and no
  decorative shapes.
- Main content uses generous outer padding and a legible maximum width. Avoid
  a blanket card around every page; page canvas is a valid surface.
- Page headers lead with one clear title, concise context, and at most one
  primary action. Metadata comes beneath the title rather than competing beside it.

### Information-density modes

| Mode | Pages | Treatment |
|---|---|---|
| Brand-forward | Today, onboarding, empty states, progress, completion | More whitespace; one edge-bound pale-blue shape may appear; focus card can use pale blue |
| Balanced | Library, vocabulary, practice landing, settings | Mostly quiet white cards; sparse blue surfaces; no more than one organic shape per viewport |
| Study-first | TCF drills, listening, reading, quiz runner, answer review | Cream/white canvas, strong content hierarchy, no decorative shape behind questions, audio controls, answers, or passage text |

### Organic pale-blue shapes

These are soft, asymmetric fields—not blobs sprinkled everywhere. They sit
behind content with low visual priority, clipped at a page/card edge, and use
`--surface-blue` at low opacity. They must never reduce text contrast,
intercept clicks, animate continuously, or sit behind a question/passage.

Use them in a single intentional place per page: for example, the upper-right
corner of Today or the lower-left corner of an empty state. Do not place them
in the sidebar or in dense assessment screens.

## 5. Logo and star system

### Logo

- Use the final **bold** Sundew icon as the default application icon; it stays
  legible in the sidebar and browser-sized contexts.
- Use the full horizontal wordmark only where there is enough room to preserve
  its proportions (sidebar top or marketing/onboarding); do not recreate the
  wordmark with text.
- Do not alter its geometry, recolour individual elements, add a container
  shape, or pair it with AI sparkle imagery.
- The primary icon is for warm light backgrounds. The blue-background/white
  symbol version is reserved for a blue field where the primary icon would not
  meet contrast requirements.

### Red organic star

Use the star as a small, meaningful marker adjacent to a specific object:

- a recurring error in feedback;
- an item due for review;
- today's most valuable next action;
- a milestone worth acknowledging.

The star cannot stand in for every alert. Standard errors use the error token;
unseen counts use neutral/blue status; learning progress uses blue, green, or
orange according to its existing meaning.

## 6. Component rules

Before styling a page, decide whether its need belongs in a shared primitive.
Prefer the following sequence:

1. design token;
2. existing shared UI primitive;
3. shared layout/component variant;
4. page-specific styling only when it encodes page-specific meaning.

| Component | Visual rule |
|---|---|
| Primary button | French Blue fill, white label, clear hover/focus state; one primary action per immediate decision area |
| Secondary button | White or muted surface with blue/navy text and restrained border |
| Navigation item | Icon + label; active state is pale blue with blue icon/text, not a large elevated card |
| Standard card | White, 14px radius, calm padding, only enough separation to scan groups |
| Focus card | Pale-blue surface; may carry the red star when it represents the learner's selected focus |
| Status badge | Small and semantic; TCF level badges remain a separate level system, not red-star decoration |
| Empty state | Direct next step, optional organic edge shape, no character illustration |
| Form/input | White field, visible border, French Blue focus ring; error state uses red only for the actual invalid field/message |

## 7. Content and interaction tone

Copy is supportive and direct: “Continue reading”, “Review this error”, “Start
10 questions”. It should name the learner's next action, not the system
implementation. Avoid filler such as “Let’s unlock your potential” and avoid
calling normal actions “AI-powered”.

Motion is optional and purposeful:

- short opacity/position transitions when opening panels or switching a selected state;
- no looping ambient animation;
- respect `prefers-reduced-motion`;
- reserve any celebratory motion for a real completion or milestone.

Keyboard focus must be clearly visible in French Blue. Text and interactive
states must meet WCAG AA contrast requirements; organic decorations never
carry necessary information.

## 8. Implementation order

1. Add/replace global semantic tokens and the radius/shadow scale in
   `src/app/globals.css`; preserve existing semantic aliases so learning logic
   and existing class names continue to work.
2. Update shared UI primitives and the sidebar: buttons, cards, dialogs,
   navigation selection, focus rings, and final logo assets.
3. Establish shared page shell/header and low-density decorative-shape
   primitive; it must be opt-in, not a global background effect.
4. Refine one brand-forward proof page (**Today**) against the reference.
5. Refine TCF overview and then drill/reading/listening screens using the
   study-first rules, validating that the visual system does not impair task
   focus.
6. Apply the resulting shared system to Library, Vocabulary, Practice,
   Speaking, Progress, and Settings.

After each phase, run lint/type checks and visually inspect desktop and mobile
layouts. No phase may change a route, server action, database schema, API
contract, or learning decision.

## 9. Acceptance checklist

- [ ] Sundew is recognisable from logo, French Blue interaction language, and
      restrained red-star meaning—not from generic AI decoration.
- [ ] Every primary CTA is French Blue; red is never used as a default CTA.
- [ ] Organic pale-blue fields appear only in intentionally low-density areas.
- [ ] A passage, question, answer choice, and listening control are never
      visually obscured by decoration.
- [ ] Shared components—not page-local overrides—carry the common visual rules.
- [ ] Existing routes, flows, content, and TCF behaviour remain unchanged.
- [ ] Keyboard focus, text contrast, and reduced-motion behaviour remain usable.
