import "server-only";
import { db } from "@/lib/db";

/**
 * Append-only record of sensitive admin actions.
 *
 * Deliberately never throws into the caller: an audit write failing must not
 * roll back the business action that succeeded. Failures are logged for the
 * operator instead. Pass `tx` when the action must be atomic with the write it
 * describes (a refund, say) — then a failure does roll back, which is correct
 * there.
 */
type AuditInput = {
  userId: string | null;
  /** Constrained to the known set so a typo cannot create a silent new action. */
  action: AuditedAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

const AUDITED_ACTIONS = [
  "user.create",
  "user.update",
  "user.deactivate",
  "product.publish",
  "product.unpublish",
  "product.archive",
  "product.price_change",
  "inventory.manual_adjustment",
  "order.status_change",
  "order.refund",
  "order.cancel",
  "payment.verified",
  "settings.update",
  "media.delete",

  // --- Phase 4 (admin CMS) -------------------------------------------------
  // Added only where a mutation is genuinely privileged: it changes what the
  // public sees, touches customer data, or alters business configuration.
  // Deliberately absent: reads, filter changes, and draft-to-draft edits of a
  // record that is not published — auditing those would bury the entries that
  // matter under noise.
  "product.created",
  "product.updated",
  "product.images_updated",
  "collection.created",
  "collection.updated",
  "collection.published",
  "collection.unpublished",
  "collection.products_updated",
  "customer.updated",
  "team.created",
  "team.updated",
  "content.updated",
  "media.uploaded",
  "media.updated",
  "inquiry.status_change",
  "inquiry.updated",
  "order.note_updated",
] as const;

export type AuditedAction = (typeof AUDITED_ACTIONS)[number];

/**
 * Runtime guard, for the one case types cannot cover: an action name arriving
 * from outside the codebase (an admin API payload, a replayed job).
 */
export function isAuditedAction(value: string): value is AuditedAction {
  return (AUDITED_ACTIONS as readonly string[]).includes(value);
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as object,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record action", input.action, error);
  }
}
