# Roadmap

This is a directional roadmap, not a promise of dates. Priorities should be revisited against actual learner use before implementation begins.

## Current priorities

1. Consolidate documentation and make the current source of truth easy to find.
2. Complete the production ownership migration and enforce private-data access consistently across every server entry point.
3. Establish a safe private deployment and a read-only public demo with no anonymous paid-AI calls.
4. Verify TCF content quality and close the most valuable review-loop gaps.
5. Improve the learning loop only where real use reveals friction or weak retention.

## Planned V2 increment

The [Sundew V2 plan](product/sundew-v2-plan.md) defines the next bounded product
increment: a personal learning home, one complete TCF speaking workflow, then an
evaluated learning coach. Stage 1 is implemented in the working tree, with the
populated-history manual acceptance check still pending. Stage 2 is in development;
the [Stage 2 development plan](product/sundew-v2-stage2-plan.md) details the voice workflow.
Stage 3 remains planned.
Production ownership, private media, and budget controls remain prerequisites for
the voice pilot; the public demo retains its read-only/precomputed boundary.

## Review center and study plans

The [review center and study plan development plan](product/sundew-review-study-plan.md)
is an explicitly requested addition, now in development but not accepted.
It covers unified errors and review across TCF listening/reading, writing,
vocabulary, conjugation, and Quiz/cloze; resumable practice; editable seven-day
plans; and completion linked to saved answers. This is broader than the existing
Review links and Today focus, and broader than Stage 3's next-activity recommendation.

Development and acceptance of this increment can proceed while Stage 2 pilot
validation remains pending. The delivery sequence is data capture and scheduling,
the review center, review sessions, seven-day plans, completion integration, then
migration and end-to-end verification. Speaking evidence is integrated only after
its Stage 2 validation. This does not waive any V2 release or security gates.
The current code checkpoint covers part of data capture and a bounded source-linked
Review list. Fixed review sessions, management controls, and seven-day plans remain open.

The 2026-09-22 implementation specifications define the
[isolated migration rehearsal](operations/review-migration-rehearsal.md),
[unified review state](product/review-state-spec.md), and
[recoverable sessions](product/review-session-spec.md).
The isolated 0029–0032 rehearsal has now run; additive 0033/0034 and application
fixes address ownership constraints, stale feedback publication, and conjugation
request deduplication. The [focused execution report](operations/review-migration-evidence/2026-09-22/report.md)
records 25 passing database checks. Next is shared state/backfill, then session
implementation. Browser, rollout, and complete feature acceptance remain open.

## Deferred work

- General multi-user invitations and per-user AI quotas after the ownership and budget model is complete.
- Additional TCF data enrichment and explanation coverage after source-data issues are resolved.
- Advanced SRS algorithms beyond the review plan's explicit rules, richer grammar-reference workflows, and other secondary practice modes.
- Mobile-native packaging and broader distribution.

## Decision rule

Do not promote an old plan simply because it is detailed. Before starting a feature, verify that it supports the product vision, matches the current schema and route structure, respects production security boundaries, and addresses an observed learner need.
