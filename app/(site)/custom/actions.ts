"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  CONTACT_REQUEST_TYPE,
  commissionSchema,
  contactSchema,
  fieldErrors,
  type FormState,
} from "@/lib/inquiries";
import { rateLimit } from "@/lib/rate-limit";

/** Best-effort client key for throttling. Not an identity, just a bucket. */
async function clientKey(prefix: string): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return `${prefix}:${ip}`;
}

const GENERIC_FAILURE =
  "Something went wrong sending that. Please try again, or WhatsApp the studio.";

export async function submitCommission(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = commissionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  // Honeypot filled — accept silently so the bot does not learn it was caught.
  if (parsed.data.website) {
    return { status: "success", message: "Thank you — your enquiry has been sent." };
  }

  if (!(await rateLimit(await clientKey("commission")))) {
    return {
      status: "error",
      message: "That is a few enquiries in a short time. Please try again shortly.",
    };
  }

  // Drop the honeypot before it reaches Prisma.
  const data = { ...parsed.data, website: undefined };

  try {
    await db.customOrderInquiry.create({
      data: {
        customerName: data.customerName,
        email: data.email,
        phone: data.phone ?? null,
        organisation: data.organisation ?? null,
        requestType: data.requestType,
        quantity: data.quantity ?? null,
        desiredDate: data.desiredDate ?? null,
        budget: data.budget ?? null,
        description: data.description,
        // status defaults to NEW. No quote, no price, no order — a commission
        // becomes commercial only once the studio has quoted it.
      },
    });
  } catch (error) {
    console.error("[commission] failed to record enquiry", error);
    return { status: "error", message: GENERIC_FAILURE };
  }

  return {
    status: "success",
    message:
      "Thank you — your enquiry is with the studio. They will come back to you with a quotation.",
  };
}

export async function submitContact(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  if (parsed.data.website) {
    return { status: "success", message: "Thank you — your message has been sent." };
  }

  if (!(await rateLimit(await clientKey("contact")))) {
    return {
      status: "error",
      message: "That is a few messages in a short time. Please try again shortly.",
    };
  }

  try {
    await db.customOrderInquiry.create({
      data: {
        customerName: parsed.data.customerName,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        requestType: CONTACT_REQUEST_TYPE,
        description: parsed.data.description,
      },
    });
  } catch (error) {
    console.error("[contact] failed to record message", error);
    return { status: "error", message: GENERIC_FAILURE };
  }

  return {
    status: "success",
    message: "Thank you — your message is with the studio.",
  };
}
