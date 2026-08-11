import { Button } from "@/components/ui/button";

/**
 * A form, not a client component: the whole interaction is one POST, so it needs
 * no JavaScript and works before hydration.
 */
export function PublishToggle({
  id,
  published,
  action,
  label = "piece",
}: {
  id: string;
  published: boolean;
  action: (formData: FormData) => Promise<void>;
  label?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant={published ? "ghost" : "outline"}>
        {published ? "Unpublish" : "Publish"}
        <span className="sr-only"> this {label}</span>
      </Button>
    </form>
  );
}
