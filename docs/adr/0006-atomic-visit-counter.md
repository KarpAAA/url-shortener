# 0006 — Atomic visit counter in PostgreSQL

Date: 2026-10-01 Status: accepted

## Context

`GET /stats/:code` reports how many times a link was visited. Redirects are the hot path and
are concurrent: a popular link is hit by many requests at once, possibly on several
application instances. The counter must not lose visits.

## Options considered

1. **Read-modify-write in the application**: load the row, add one, save. This is what
   "load the aggregate → call a method → save" produces, and it is wrong under concurrency:
   two requests read `41`, both write `42`, one visit is gone. A transaction at the default
   isolation level does not prevent it.
2. **Read-modify-write with optimistic locking** (a `version` column): correct, but every
   conflict is a retry, and on a hot link most requests conflict.
3. **`SELECT … FOR UPDATE`, then update**: correct; two round trips and a lock held between
   them.
4. **Atomic increment in the database**: `UPDATE links SET visits = visits + 1 WHERE code = $1`.
   The addition happens inside PostgreSQL under the row lock; concurrent updates queue and each
   sees the previous one's result.
5. **Asynchronous counting**: publish an event per visit, count in batches (a queue, or Redis
   `INCR` flushed periodically). Removes the write from the hot path at the price of a broker,
   a consumer, eventual consistency and a new way to lose or double-count visits.
6. **An append-only `clicks` table**, counted with `COUNT(*)` or rolled up. Needed for
   per-click analytics, which is not a requirement.

## Decision

Option 4, as a single statement that also performs the lookup:

```sql
UPDATE links
SET visits = visits + 1, last_visited_at = $2, updated_at = $3
WHERE code = $1
RETURNING original_url;
```

In code this is `prisma.link.updateManyAndReturn({ where: { code }, data: { visits: {
increment: 1 }, … } })`. Zero rows returned means the code does not exist → `404`.

The repository port reflects it: `registerVisit(code, at): Promise<OriginalUrl>` — one
operation, not `getById` + `save`. The domain object has no "record a visit" method on
purpose; an in-memory increment would invite exactly the read-modify-write this avoids.

## Consequences

- No lost updates, at any concurrency and across instances. Proven against real PostgreSQL:
  250 parallel visits through one pool, 250 through two pools (two "instances"), and 150
  parallel HTTP redirects each end with the exact count. A mock could not fail this test,
  which is why it runs on a database.
- One round trip per redirect: find, count and read are the same statement (4 buffers for
  the lookup, 16 in total at one million rows — [`architecture.md`](../architecture.md) §4).
- Counts are exact and immediately visible in `/stats`.
- The cost: every visit writes a new row version, and visits of one link serialise on its row
  lock. For a very hot link that row becomes a bottleneck and a source of table bloat. This is
  a known trade-off, written down in the conventions too; option 5 is the remedy when
  measurements call for it ([`scaling.md`](../scaling.md)).
- `visits` is `bigint`: a counter outgrows `int4` (2.1 billion), and widening a column later
  rewrites the table.
