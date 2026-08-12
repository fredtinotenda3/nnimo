import { completeSandboxPayment } from "@/app/(site)/checkout/sandbox/actions";
import { Button } from "@/components/ui/button";

/** Two forms, no client JavaScript. */
export function SandboxPaymentControls({
  orderNumber,
  accessToken,
}: {
  orderNumber: string;
  accessToken: string;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      <form action={completeSandboxPayment}>
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <input type="hidden" name="token" value={accessToken} />
        <input type="hidden" name="outcome" value="PAID" />
        <Button type="submit" size="lg" className="w-full">
          Simulate successful payment
        </Button>
      </form>
      <form action={completeSandboxPayment}>
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <input type="hidden" name="token" value={accessToken} />
        <input type="hidden" name="outcome" value="FAILED" />
        <Button type="submit" size="lg" variant="outline" className="w-full">
          Simulate failed payment
        </Button>
      </form>
    </div>
  );
}
