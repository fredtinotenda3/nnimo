"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * PHASE 8 (finding H2). Error boundary for the admin.
 *
 * Separate from the storefront boundary because the reader is different, not
 * because the security rule is. An operator can act on a failure — retry, go back
 * to the dashboard, or send the reference to whoever maintains this — so the copy
 * is direct rather than apologetic.
 *
 * THE SECURITY RULE IS IDENTICAL AND IS NOT RELAXED FOR THE ADMIN.
 *
 * It is tempting to render `error.message` here on the grounds that everyone
 * reaching /admin is authenticated staff. That reasoning does not hold:
 *
 *   - This boundary also catches errors thrown while the session is being resolved,
 *     which is exactly when the reader might not be who we assume.
 *   - Nnino's RBAC has six roles. A CONTENT_MANAGER is authenticated but is not
 *     entitled to see a Prisma error naming the Order table and its columns.
 *   - Error text has a habit of being pasted into support threads and screenshots.
 *
 * So the digest and nothing else, the same as the public boundary. The full stack
 * is in the platform log, which is the correct place for it and is already
 * access-controlled.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <p className="text-label text-muted-foreground">Something went wrong</p>
      <h1 className="text-heading-1 mt-3">This screen could not be loaded</h1>

      <div className="mt-6 border-l-2 border-ochre pl-4">
        <p className="text-body-sm text-muted-foreground">
          The action was not completed. Nothing has been saved, so it is safe to
          retry. If it fails again, the reference below identifies the failure in the
          server log.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">Back to the dashboard</Link>
        </Button>
      </div>

      <dl className="mt-10 border-y border-border py-3">
        <div className="flex justify-between gap-4">
          <dt className="text-metadata text-muted-foreground">Reference</dt>
          <dd className="text-metadata font-mono">{error.digest ?? "not available"}</dd>
        </div>
      </dl>
    </div>
  );
}
