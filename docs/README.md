# Lumière Documentation

This directory separates current operating documentation from historical design and implementation records.

## Current source of truth

- [Product vision](product/vision.md): the problem, audience, principles, and product boundaries.
- [System architecture](architecture/system.md): the application, data, AI, and ownership model implemented today.
- [TCF](architecture/tcf.md): TCF content, practice modes, progress, and explanation behavior.
- [Deployment and security](operations/deployment-security.md): the current deployment target and production security requirements.
- [Speaking pilot operations](operations/speaking-pilot.md): Stage 2 private voice configuration, migration, retention, and release gates.
- [Roadmap](roadmap.md): active work and deliberately deferred work.
- [Sundew V2 plan](product/sundew-v2-plan.md): planned personal learning home, TCF speaking workflow, and bounded learning coach, with stage gates and portfolio deliverables.
- [V2 Stage 1 development plan](product/sundew-v2-stage1-plan.md): navigation and goals, the Today workflow, evidence and weekly recap, implementation batches, and acceptance checks.
- [V2 Stage 2 development plan](product/sundew-v2-stage2-plan.md): one complete Task 2 voice workflow, evidence-linked feedback, follow-up practice, private recording storage, cost controls, and pilot acceptance gates.
- [Review center and study plan development](product/sundew-review-study-plan.md): in-progress error collection and the planned review sessions, seven-day study plans, task completion evidence, implementation batches, and acceptance gates; independent of Stage 2 pilot validation.
- [Review migration rehearsal](operations/review-migration-rehearsal.md): executable isolated database harness and migration/ownership/recovery checks; focused M1 passed, M2 backfill remains open.
- [Review migration execution evidence](operations/review-migration-evidence/2026-09-22/report.md): 25 passing database checks, observed failures and fixes, and remaining acceptance boundaries.
- [Unified review state specification](product/review-state-spec.md): canonical identities, management transitions, scheduling eligibility, vocabulary compatibility, and service contracts; not yet implemented.
- [Recoverable review session specification](product/review-session-spec.md): private snapshots, run/item states, atomic answer saving, offline recovery, and AI operation fencing; not yet implemented.
- [Data quality](operations/data-quality.md): known content-quality issues that require source verification.

## Historical records

`PRD*.md`, `Sprint*.md`, `audit-*.md`, `superpowers/plans/`, and `superpowers/specs/` are historical records unless a current document above links to a specific section. They may describe completed work, rejected approaches, or assumptions that no longer match the code.

Do not use a historical document as an implementation contract without reconciling it against the current source-of-truth documents and the code.
