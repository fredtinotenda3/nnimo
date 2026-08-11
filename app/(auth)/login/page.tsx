import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/session";
import { BRAND } from "@/lib/brand";
import { Container } from "@/components/ui/container";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  // A login page must never be indexed.
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in — no reason to show the form.
  const user = await getAdminUser();
  if (user) redirect("/admin");

  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-surface-sunken py-16">
      <Container className="max-w-md">
        <Link href="/" className="text-heading-2">
          Nnino
        </Link>
        <p className="text-label mt-8 text-muted-foreground">Team access</p>
        <h1 className="text-heading-1 mt-3">Sign in</h1>
        <p className="text-body-sm mt-4 text-muted-foreground">
          For the {BRAND.name} team. Customer accounts are separate and are not part
          of this sign-in.
        </p>

        <LoginForm next={next} />
      </Container>
    </div>
  );
}
