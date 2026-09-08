# Public demo content source register

Updated: 2026-09-07. No public-demo learning content has been approved or seeded
as part of the deployment baseline. This register is separate from the code LICENSE.

## Current inventory and release status

| Material | Location / source | Public-demo status | Required action |
| --- | --- | --- | --- |
| Original TCF demo questions and explanations | Planned `data/demo-tcf/` | Not yet created / approved | One demo set per user decision on 2026-09-07; selection, skill, and count pending. Record author / public-use permission and review each question |
| Original demo audio and images | Planned `public/demo/tcf/` | Not yet created / approved | Record production method, source references, permission evidence, and matching question IDs |
| Original reading texts and simulated progress / feedback | Planned demo-only seed scripts | Not yet created / approved | Label simulated content and verify no personal history is copied |
| Existing development seed texts | `scripts/seed.ts`, `scripts/seed-rules.ts` | Not approved for demo | Review individually; do not use the generic seeds to initialize demo |
| Private exam content and recordings | `public/media/`, local `data/`, personal database | Excluded | Keep out of Git, build context, image layers, demo, screenshots, and walkthroughs |
| Sundew brand artwork | `public/assets/sundew-logo-assets/`; asset README describes a user-supplied identity board | Source description recorded; permission not independently verified | Confirm provenance and public-use permission before public release |
| Third-party packages and fonts | Lockfile and font configuration | Governed by their respective licenses | Retain applicable notices; the project LICENSE does not replace them |

## Record for each new public asset

- Asset ID and repository path / demo record ID
- Author or provider; original source URL or local creation record
- Creation method, including generation tools where applicable
- Permission or license evidence for public display and distribution
- Reviewer and review date
- Linked question / article and media playback or rendering result
- Status: pending / approved for demo / excluded

Do not place private source material or credentials in this register. An empty
field or a planned asset is not approval. T9 must replace planned entries with
the actual asset inventory before T11 can release the demo.
