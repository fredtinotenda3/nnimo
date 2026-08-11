# Security decisions

## Authorisation is enforced in the data path, not the proxy

`proxy.ts` (Next 16's rename of `middleware.ts`) does one thing: redirect a
visitor with no session cookie away from `/admin` so they get the login page
instead of a flash of chrome. It does **not** verify the token and does **not**
check roles.

That is deliberate. A proxy/middleware layer is the wrong place for the only
authorisation check:

- It can be bypassed by request-header manipulation. CVE-2025-29927 was exactly
  this class of bug in Next.js itself.
- It cannot see current database state, so it cannot know a user was deactivated
  a minute ago.
- It runs before the route knows what it is protecting, so the check has to be
  path-pattern matching rather than "does this person have `order:refund`".

The authoritative check is `lib/session.ts`. Every admin page, route handler and
server action calls `requireAdmin()` or `requirePermission(...)`, which resolves
the session and then re-reads the `User` row. The admin layout guards the whole
subtree; each page *also* guards its own section, because a layout guard alone
would let a URL typed into the address bar reach a page the role should not see.

## What is never trusted from the client

| Value | Where it actually comes from |
|---|---|
| Price | `Product.price` at checkout, snapshotted onto `OrderItem` |
| Order total | Recomputed server-side from line items |
| Stock | `Inventory`, via a conditional UPDATE |
| User identity | Session cookie → `User` row |
| Role / permissions | `User.role` re-read per request, never the JWT claim |
| Payment status | Server-to-server verification only; `verifiedAt` set nowhere else |

## Credentials

- bcrypt at cost 12 (~250ms/hash).
- Login compares against a dummy hash when the email does not exist, so response
  time does not reveal which addresses have accounts.
- The login form returns one generic message for every failure. Distinguishing
  "no such account" from "wrong password" is an account-enumeration oracle.
- `?next=` is validated to be a local path (`/…` but not `//…`) so the login
  form cannot be turned into an open redirect.
- The seed only sets a password on **create**. Re-running it never resets a
  password the owner has since changed.

## Uploads

`lib/media/types.ts` validates before anything touches disk:

- MIME allow-list (JPEG, PNG, WebP, AVIF) — not a blocklist.
- 12 MB ceiling; empty files rejected.
- **The client filename is never used as a path.** The storage key is
  `uploads/YYYY/MM/<uuid>.<ext>`, where the extension comes from the validated
  MIME type. That removes path traversal, content-type confusion and collisions
  in one move.
- The local driver additionally re-normalises the resolved path and refuses
  anything outside the media root — defence in depth, since the key is generated
  rather than supplied.

## Response headers

Set in `next.config.ts` for every route: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
`Permissions-Policy` denying camera/microphone/geolocation, and HSTS with
`preload`.

**Not yet set: Content-Security-Policy.** A CSP is only worth shipping once the
real script surface is known — a policy written now would either be so loose it
achieves nothing, or would break the first analytics or payment SDK added in
Phase 6. It is on the Phase 8 hardening list, and `next/font` self-hosting means
no `fonts.googleapis.com` origin will need allowing.

## Audit trail

`recordAudit()` writes an append-only `AuditLog` row for sensitive actions. The
action name is constrained to a closed union, so a typo cannot silently create a
new untracked action type.

By default it swallows its own failures: an audit write failing must not roll back
the business action that succeeded. Where the two must be atomic — a refund — the
caller passes a transaction so a failure does roll back, which is correct there.

`OWNER` is the only role that can manage users or read the audit log. Those are
the two capabilities that would let someone escalate their own access or cover
their tracks, so `MANAGER` — which otherwise runs the whole business — has
neither.

## Environment

`lib/env.ts` validates every variable at boot with Zod and throws on
misconfiguration. `AUTH_SECRET` under 32 characters is a hard failure, and
`MEDIA_DRIVER=s3` demands its entire credential set — a half-configured bucket
silently writing nowhere is worse than refusing to start. The module is
`server-only`, so importing it from a client component is a build error rather
than a leak.
