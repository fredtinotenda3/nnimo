"use client";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/admin/actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}
