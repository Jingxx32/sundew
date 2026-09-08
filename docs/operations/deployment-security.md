# Deployment and Security

## Target model

Lumière is intended to support two isolated environments:

- **Private application:** authenticated learning with private data and paid AI capabilities.
- **Public demo:** read-only curated content and precomputed AI examples, with no access to private data or paid AI credentials.

The demo and private environment must use separate databases, runtime identities, and media boundaries. They may share application code but must not share private data access.

## Production access

Production uses Azure Easy Auth with an allowlisted identity. The application must verify the provider, identity, account status, and authorization server-side. Deployment headers are trustworthy only when the origin cannot be bypassed.

Every personal-data action must use the authenticated user identity rather than a client-supplied owner identifier. Private responses must not enter shared caches.

## Before production launch

- Complete owner scoping and verify it across server actions, route handlers, background work, and direct database reads.
- Validate backups and restoration for the database and media.
- Establish explicit limits for inputs, paid AI operations, concurrency, and total budget.
- Verify build, migration, authentication, private access, demo isolation, and media authorization in a real deployment.
- Keep real TCF and learner material out of public demo data unless its distribution rights are confirmed.

## Historical detail

The Azure deployment and invite-only security plans contain implementation history and unresolved checklists. Use this document for current policy; consult the historical plans only for evidence or a specific unfinished task.
