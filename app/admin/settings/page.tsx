import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { env } from "@/lib/env";
import {
  SETTING_GROUPS,
  SETTING_GROUP_DESCRIPTION,
  SETTING_GROUP_LABEL,
  isKnownSettingKey,
  settingsInGroup,
} from "@/lib/admin/settings-registry";
import { getActiveProviderId } from "@/lib/payments";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { SettingsGroupForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const PROVIDER_DESCRIPTION: Record<string, string> = {
  sandbox: "Sandbox — test payments, no real money moves",
  manual: "Manual settlement — orders are placed unpaid and confirmed by the studio",
  paynow: "Paynow (credentials configured)",
};

/**
 * Business settings.
 *
 * Only keys defined in the registry are read or rendered. That is deliberate and
 * it is the security property of this page (§10, §21): the form cannot display a
 * value it does not have a definition for, and no definition is a credential.
 *
 * Payment and storage secrets are environment configuration, validated at boot
 * by lib/env.ts, and are never read into a page. The panel at the bottom reports
 * whether they are configured — a boolean, never a value — because "is Paynow
 * set up" is a question an operator legitimately needs answered without anyone
 * having to open a terminal.
 */
export default async function AdminSettingsPage() {
  await requirePermission("settings:write");

  const rows = (await db.setting.findMany({ select: { key: true, value: true } })) as {
    key: string;
    value: string;
  }[];

  const values: Record<string, string> = {};
  for (const row of rows) {
    if (isKnownSettingKey(row.key)) values[row.key] = row.value;
  }

  // Rows the registry does not describe. Shown as a count rather than rendered:
  // something reads them, but this page cannot know what a safe editor for them
  // would look like.
  const unmanaged = rows.filter((row) => !isKnownSettingKey(row.key));

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Operational settings the studio can change without a developer. Blank means “not decided yet”, and the site treats it that way."
      />

      {SETTING_GROUPS.map((group) => {
        const definitions = settingsInGroup(group);
        if (definitions.length === 0) return null;

        return (
          <AdminSection
            key={group}
            title={SETTING_GROUP_LABEL[group]}
            description={SETTING_GROUP_DESCRIPTION[group]}
          >
            <div className="max-w-2xl rounded-[var(--radius-md)] border border-border bg-surface p-5">
              <SettingsGroupForm group={group} definitions={definitions} values={values} />
            </div>
          </AdminSection>
        );
      })}

      <AdminSection
        title="Credentials"
        description="Configured outside the application and never shown here. Only whether each is set is reported."
      >
        <dl className="max-w-2xl divide-y divide-border border-y border-border">
          {[
            {
              /**
               * Reports the RESOLVED provider, not the requested one.
               *
               * These two differ precisely when it matters most: a production
               * deployment asking for the sandbox provider is resolved down to
               * manual settlement, and an operator reading this screen needs to
               * see what the shop is actually doing rather than what an
               * environment variable asked for. The previous version also read
               * anything other than "sandbox" as configured Paynow, which would
               * now be an outright false statement.
               */
              label: "Payment provider",
              value: PROVIDER_DESCRIPTION[getActiveProviderId()] ?? "Unknown provider",
            },
            {
              label: "Media storage",
              value:
                env.MEDIA_DRIVER === "s3"
                  ? "S3-compatible bucket (credentials configured)"
                  : "Local disk — not suitable for production",
            },
            {
              label: "Email",
              value:
                env.EMAIL_TRANSPORT === "dev"
                  ? "Development transport — emails are logged, not sent"
                  : "Disabled",
            },
          ].map((item) => (
            <div key={item.label} className="flex flex-wrap justify-between gap-4 py-3">
              <dt className="text-body-sm text-muted-foreground">{item.label}</dt>
              <dd className="text-body-sm">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-metadata max-w-2xl text-muted-foreground">
          To change any of these, update the environment variables and redeploy. The
          application refuses to start on a half-configured provider rather than failing
          silently mid-checkout.
        </p>
      </AdminSection>

      {unmanaged.length > 0 ? (
        <p className="text-body-sm text-muted-foreground">
          {unmanaged.length} setting{unmanaged.length === 1 ? "" : "s"} in the database
          {unmanaged.length === 1 ? " is" : " are"} not described in the settings registry
          and {unmanaged.length === 1 ? "is" : "are"} therefore not editable here.
        </p>
      ) : null}
    </div>
  );
}
