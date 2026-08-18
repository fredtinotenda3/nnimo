"use client";

import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

/**
 * PHASE 8 (finding H2). Error boundary for the public storefront.
 *
 * Without this file, an unhandled error in any app/(site) route rendered Next's
 * default error screen: no chrome, no way back, and nothing that reads like this
 * business. Because it sits inside app/(site)/, the header and footer are still
 * rendered by the layout above, so a failure looks like a page of the site
 * reporting a problem rather than the site having fallen over.
 *
 * WHAT IS DELIBERATELY NOT SHOWN
 *
 * `error.message` is never rendered. In production Next replaces server-side error
 * messages with a generic string before they reach the client, so this is belt and
 * braces rather than the only control — but the boundary also catches errors thrown
 * during client rendering, where the message is whatever the code threw and can
 * name internal modules, query shapes or identifiers. A customer has no use for it
 * and it is not ours to publish. Nor is `error.stack`.
 *
 * `error.digest` IS shown, and only that. It is a hash Next generates server-side
 * and writes to the platform log alongside the real stack trace, so a customer can
 * quote eight characters to the studio and an operator can grep for it. That is the
 * whole point of the digest: it correlates without disclosing.
 *
 * NO LOGGING FROM HERE. This is a client component; lib/logger.ts is server-only
 * and the server has already logged the error with its full stack. A fetch to some
 * client-side reporting endpoint would be a new external integration, which this
 * phase explicitly excludes.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Section className="pt-32 lg:pt-40">
      <div className="mx-auto max-w-xl">
        <p className="text-label text-muted-foreground">Something went wrong</p>
        <h1 className="text-heading-1 mt-3">This page could not be loaded</h1>

        <div className="mt-6 border-l-2 border-ochre pl-4">
          <p className="text-body-sm text-muted-foreground">
            The problem is on our side, not yours. Trying again often works — the
            studio has been notified either way.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          {/* `reset` re-renders the segment without a full page reload, which
              recovers from a transient failure (a dropped database connection,
              say) without losing the visitor's place. */}
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Return to the home page</Link>
          </Button>
        </div>

        <p className="text-metadata mt-10 text-muted-foreground">
          If you contact us about this, quoting the reference below lets us find the
          exact failure in our logs.
        </p>
        <dl className="mt-3 border-y border-border py-3">
          <div className="flex justify-between gap-4">
            <dt className="text-metadata text-muted-foreground">Reference</dt>
            {/* The digest, or an honest absence. A fabricated reference would be
                worse than none: it would send an operator looking for a log line
                that was never written. */}
            <dd className="text-metadata font-mono">{error.digest ?? "not available"}</dd>
          </div>
        </dl>
      </div>
    </Section>
  );
}
