# Lumière Documentation

This directory separates current operating documentation from historical design and implementation records.

## Current source of truth

- [Product vision](product/vision.md): the problem, audience, principles, and product boundaries.
- [System architecture](architecture/system.md): the application, data, AI, and ownership model implemented today.
- [TCF](architecture/tcf.md): TCF content, practice modes, progress, and explanation behavior.
- [Deployment and security](operations/deployment-security.md): the current deployment target and production security requirements.
- [Roadmap](roadmap.md): active work and deliberately deferred work.
- [Data quality](operations/data-quality.md): known content-quality issues that require source verification.

## Historical records

`PRD*.md`, `Sprint*.md`, `audit-*.md`, `superpowers/plans/`, and `superpowers/specs/` are historical records unless a current document above links to a specific section. They may describe completed work, rejected approaches, or assumptions that no longer match the code.

Do not use a historical document as an implementation contract without reconciling it against the current source-of-truth documents and the code.
