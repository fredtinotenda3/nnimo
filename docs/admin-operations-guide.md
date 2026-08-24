# Nnino Ceramics — Admin Guide

This is a plain-language guide to running the website from the admin area. It matches what is actually built today — nothing described here is planned or "coming soon" unless the guide says so.

Everywhere below, "the admin" means the pages under `nninoceramics.com/admin` (or your local address followed by `/admin`).

---

## 1. Signing in and understanding roles

**Address:** `/login`

Type your email and password and click **Sign in**. This sign-in is only for the Nnino team — customers who create an account on the shop use a separate sign-in and cannot get into the admin.

If you type the wrong details a few times in a row, the site will briefly stop accepting attempts. This is a safety feature, not a fault — wait a few minutes and try again.

### Roles

Every team member is given a role, and the role decides what they can see and change. You don't set this yourself day to day — it's set up when an account is created — but it's worth knowing what each role can do, especially if you're deciding who should have which one:

| Role | Can do |
|---|---|
| **Owner** | Everything, including the two most sensitive things: managing team accounts and reading the audit log (see §21). There should be very few Owners. |
| **Manager** | Runs the day-to-day business: products, ranges, media, orders, customers, enquiries, team, content, and settings. Can also record manual payments and issue refunds. Cannot manage team accounts or read the audit log. |
| **Product manager** | Products, ranges, and media only. |
| **Order manager** | Orders, customers, and enquiries. Can view products and stock but not change them. |
| **Marketing manager** | Media, content, and campaigns, plus read-only access to products and ranges. |
| **Content manager** | Content, media, and team profiles, plus read-only access to products and ranges. |

A person only ever sees the sections of the admin their role covers — the navigation on the left adjusts automatically. If someone can't see a section listed in this guide, it's because their role doesn't include it, not because it's broken.

---

## 2. The dashboard

**Address:** `/admin` (this is also where "Sign in" takes you)

The dashboard is a snapshot of the business right now: recent orders, how many pieces are published versus still in the catalogue, and a feed of things that need attention (new orders, new enquiries). Every number here is real — if there have been no sales yet, it will honestly show zero rather than a sample figure.

What you see depends on your role. An Order manager, for example, sees the orders and enquiries panels but not the catalogue ones.

---

## 3. Publishing, unpublishing, and archiving a product

**Address:** `/admin/products/[piece]` — open a piece from the **Products** list, then scroll to **Publishing**.

A piece has three states:

- **Catalogue** — recorded in the system, but invisible to customers. This is where every new piece starts.
- **Published** — live on the website and, if it has a price and an availability set, buyable.
- **Archived** — kept for the studio's own record but never shown for sale, even if someone has the direct link.

To change a piece's state, open it and click the button for the state you want under **Publishing**. The button for the current state is shown but disabled.

A couple of things worth knowing:

- Publishing a piece that has no **Availability** set will automatically set it to **Made to order** — the honest default for a handmade one-off, rather than falsely claiming stock nobody has counted.
- Publishing a piece with no **price** is allowed. It appears on the site as "Price on request" with an enquiry button, but nobody can buy it online until a price is added.
- There's also a quick toggle button directly on the **Products** list, for switching between Catalogue and Published without opening the piece.

---

## 4. Adding and editing a product

**Address:** `/admin/products/new` to create one, or open any piece from `/admin/products` to edit it.

The main form is one page, split into a few groups:

**Details**
- **Name** — required.
- **Web address** — the last part of the product's URL (`/products/…`). Fills in automatically from the name while creating a new piece, but never rewrites itself once a piece already exists, so a published link never breaks.
- **SKU or reference** — optional, your own reference code.
- **Range** — which collection this piece belongs to. Can be left as "Not in a range."
- **Made by** — which team member made it, if recorded.
- **Category** — optional grouping.
- **Material** — optional, e.g. "Stoneware."
- **Description** — shown on the product page. Also used as the search-engine description if no override is set below.
- **Story** — an optional longer passage about the piece.
- **Care instructions** — optional.

**Price and availability**
- **Price** — leave blank if not yet confirmed. Blank means "not set," which is different from free — a blank-priced piece can still be published and shown, just not bought.
- **Currency** — a three-letter code (e.g. USD).
- **Availability** — one of: *Available now*, *Only a few left*, *Currently unavailable*, *Made to order*, *By commission*, *Coming soon*. If left blank on a new piece and then published, it's set to *Made to order* automatically.
- **Lead time (days)** — optional, overrides the studio-wide default for this piece only.
- **Feature this piece** — featured pieces appear first on the homepage and within their range.

**Measurements** — Height, width, and weight, all optional, all as measured by the studio.

**Provenance** — an internal **Source note**, for recording where the information came from (e.g. "Nnino Ceramics Brochure-1.pdf, Zebra Range"). Customers never see this.

Click **Save changes** at the bottom. Nothing is published or shown to customers just by saving — that's a separate step (§3).

---

## 5. Understanding product availability options

The six availability options and what each one tells a customer:

| Option | What it tells the customer |
|---|---|
| Available now | In stock, ready to go |
| Only a few left | In stock, limited quantity |
| Currently unavailable | Out of stock |
| Made to order | Made specially once ordered — the honest default for handmade one-offs |
| By commission | Only available as a custom commission |
| Coming soon | Not yet available |

A piece can only actually be **bought** on the site if it is Published, has a confirmed price, *and* its availability is one of the "sellable" options (not Currently unavailable, By commission, or Coming soon). The piece's own page in the admin shows a clear **Purchasable / Not purchasable** badge and explains exactly what's missing if it isn't — you never have to guess.

---

## 6. Uploading product photos through Media

**Address:** `/admin/media`

This is the shared photo library for the whole site — every image used anywhere on Nnino Ceramics passes through here first, whether it will end up on a product, a range, or a team profile.

To upload:

1. Go to `/admin/media`.
2. Under **Upload**, choose a file. Accepted formats are JPEG, PNG, WebP, or AVIF, up to **12 MB**.
3. Fill in **Alt text** — a short, one-sentence description of what the photo shows (e.g. "Giraffe tureen seen from the front"). This matters more than it looks: it's what a screen reader reads aloud to a visually impaired visitor, and it's shown if the image ever fails to load.
4. Optionally fill in **Source note** — an internal note about where the photo came from (a catalogue page, a photographer's name). Customers never see this.
5. Click **Upload**.

The photo now sits in the library. Uploading it does **not** attach it to anything yet — that's the next step.

A note on storage: the page tells you whether images are stored locally or in cloud storage. Local storage does not survive a redeploy, so production must always be configured for cloud storage before going live — this isn't something you need to act on day-to-day, but if photos ever seem to vanish after a site update, this is the first thing to check with whoever manages the technical side.

---

## 7. Attaching photos to a product

**Address:** open the piece at `/admin/products/[piece]`, then scroll to **Photographs**.

At the bottom of the Photographs section is **Add a photograph** — a dropdown of images already sitting in the Media library, not yet attached to this piece. Choose one and attach it.

The same photograph can be attached to more than one product (useful when one photo shows several pieces from a range) — attaching it doesn't copy the file.

If the photo you need isn't in the dropdown yet, it hasn't been uploaded — go to Media (§6) first, then come back. There's also a shortcut link straight from this page into the Media library that brings you back here afterwards.

---

## 8. Setting a primary product image

Still on the piece's **Photographs** section: each photo attached to a piece has a **Make primary** button, except the one that's already primary (marked with a **Primary** badge).

The primary image is what shows in product listings and as the first image on the product's own page. Everything else forms the gallery below it.

---

## 9. Reordering images

Each photo in the **Photographs** list has **↑** and **↓** buttons. Use these to move a photo earlier or later in the gallery order. The first-position control is disabled on the topmost image, and the last-position control is disabled on the bottom one, so you can't move an image past either end.

---

## 10. Publishing and unpublishing collections

**Address:** `/admin/collections`, or open a range at `/admin/collections/[range]`.

Ranges (collections) have three states, set from the **Status** field on the range's own page:

- **Draft** — invisible to customers.
- **Published** — visible on the site.
- **Archived** — invisible.

There's a built-in safety note: if you set a range to Published while it has no published pieces inside it, the form warns you that publishing it will put an empty page live — you may want to publish some of its pieces first (§3).

A published range only ever shows its own **published** pieces to customers, even if it has other, unpublished pieces sitting inside it in the admin.

---

## 11. Adding collection hero images

**Address:** open the range at `/admin/collections/[range]`, then look for **Hero image** in the Details section.

Choose any image already sitting in the Media library (§6) from the picker. This becomes the mood-setting background image for that range's page. As with product photos, the image must be uploaded to Media first before it will appear in this picker.

---

## 12. Managing team profiles and photos

**Address:** `/admin/team` to see everyone, `/admin/team/[person]` to edit one, `/admin/team/new` to add someone.

Fields on a team member's page:

- **Name** — required.
- **Role** — e.g. "Potter," "Sculptor."
- **Craft** — optional, a more specific description of what they do.
- **Biography** — optional. Left blank on purpose for anyone whose story hasn't been written yet, rather than filled with placeholder text — an empty biography is the honest state, not a mistake to be fixed urgently.
- **Photo** — pick from the Media library, same as a product photo.
- **Display order** — lower numbers appear first.
- **Show on the public site** — unticking this hides the person from the public Team page without deleting their record.
- **Feature this person** — featured members are shown more prominently.
- **Note** — internal only.

The Team list page shows how many people still need a biography or a photo, as a simple worklist rather than an error to fix immediately.

---

## 13. Editing homepage and other content blocks

**Address:** `/admin/content`

This page lists every piece of editable text on the site, grouped by where it appears: **Homepage**, **About**, **Nnino family**, **Custom commissions**, **Wholesale**, and **Policies and care**. A final **Other** group catches anything technically live on the site that isn't in this organised list yet.

Each block is its own small form with a label (what it is) and a note on where it appears. Type your text and save that one block — you don't need to re-save the whole page. Blocks that are blank are shown as **Not written**; a blank block stays blank on the live site rather than showing placeholder text, so there's no risk of accidentally publishing filler copy.

Some blocks are images rather than text — those show a picker into the Media library instead of a text box, the same as a product photo.

---

## 14. Managing business settings

**Address:** `/admin/settings`

Settings the studio can change without a developer, grouped as:

- **Business details** — contact email, orders email, telephone, WhatsApp number, studio address, timezone, business hours.
- **Commerce** — currency, order number prefix.
- **Production** — default lead time in days, and a note customers see about it.
- **Delivery and collection** — collection instructions, delivery policy, and whether delivery is offered at checkout at all.
- **Search and sharing** — default page title and description used by search engines when a page has no override of its own.
- **Social** — Instagram handle, Facebook page (just the handle/name, not the full link).

Leaving a field blank means "not decided yet," and the site treats it exactly that way rather than guessing.

At the bottom is a **Credentials** panel. This never shows or lets you edit an actual password or API key — it only reports, in plain words, whether payments, media storage, and email are configured (e.g. "Sandbox — test payments, no real money moves"). If any of these need to change, that's a technical change to the site's configuration, not something done from this page — flag it to whoever manages the deployment.

---

## 15. Viewing and managing custom enquiries

**Address:** `/admin/inquiries`, and `/admin/inquiries/[enquiry]` for one enquiry.

These are commission and general enquiries submitted through the website's Custom and Contact forms. The list shows the newest **open** enquiries first, regardless of age — an enquiry nobody has answered yet is more urgent than one closed last week.

Opening one enquiry shows exactly what the customer wrote (never editable — it's their own words, kept as a record) alongside fields the studio fills in:

- **Status** — one of: New, Reviewing, Quoted, Approved, Awaiting payment, In production, Completed, Delivered, Closed. Status can move in either direction at any time — an enquiry is a conversation, and conversations sometimes go backwards (a customer who accepted a quote and then asks for a different size goes back to Quoted).
- **Quote** — an amount, once one has been given.
- **Internal notes** — never shown to the customer.

---

## 16. Viewing orders and updating fulfilment status

**Address:** `/admin/orders`, and `/admin/orders/[order]` for one order.

Every order carries **two separate statuses** that are tracked independently, because they answer two different questions:

**Payment status** — has the money been received: Unpaid, Payment processing, Paid, Payment failed, Refunded, Partially refunded.

**Fulfilment status** — has the piece actually been made and sent: Awaiting confirmation → Confirmed → In production → Ready → then either Dispatched → Delivered, or Collected. Cancelled can happen from most of the earlier states.

Fulfilment can only move forward along that path (you can't send an order back from "Dispatched" to "Confirmed," for instance — a problem after dispatch is handled as a return, not a rewind). On an order's own page, only the fulfilment statuses it's actually allowed to move to next are offered.

If an order's fulfilment is moved past "Awaiting confirmation" while it's still unpaid, the admin shows a warning — it doesn't block the action, since a trusted arrangement might mean the studio starts work before payment clears, but it makes sure that's a deliberate choice rather than an oversight.

---

## 17. Recording a manual payment

**Address:** on an order's own page, `/admin/orders/[order]`, look for **Record payment received**.

This only appears when: the order was placed under manual settlement (i.e. the site isn't using a live automated payment processor), it isn't already marked paid, and it isn't cancelled — and only Owner and Manager roles can see or use it, since it's treated as a finance decision.

To record a payment:

1. Optionally fill in **How the payment arrived** (e.g. "Bank transfer," "Cash on collection") and a **Reference** (a transaction or deposit reference) — both are free text, since the form doesn't get to decide which payment methods the studio accepts.
2. Optionally add a **Note**.
3. Tick the confirmation box: *"I confirm the studio has received [amount] in full for this order."*
4. Click **Record payment received**.

**This cannot be undone from the admin.** The moment you confirm, the order is marked paid, the customer is automatically emailed a confirmation, and any stock reserved for the order is committed. Only tick the box once the full amount has genuinely been received.

---

## 18. Viewing the audit log

**Address:** `/admin/audit`

**Owner only.** This is deliberate: the audit log and account management (§1) are the two things that would let someone quietly cover their tracks, so Manager and every other role are kept out of both.

The log lists changes made across the admin — who did what, to which record, and when — most recent first. It can be searched and filtered. It's a read-only history; nothing here can be edited or deleted.

---

## 19. Using the analytics dashboard

**Address:** `/admin/analytics`, with tabs for **Overview**, **Sales**, **Products**, **Customers**, **Inventory**, and **Enquiries**.

Which tabs you see depends on your role — for instance, a Marketing manager doesn't see the Sales tab, and importantly the revenue figures behind it are never even calculated for that visit, not just hidden.

- **Overview** — a top-level summary answering: how is the business doing, what's selling, what are customers doing, and what needs attention.
- **Sales** — revenue and order figures over a chosen date range.
- **Products** — which pieces and ranges are performing.
- **Customers** — customer activity and behaviour.
- **Inventory** — a *report* on stock levels. This tab does not let you edit stock — inventory editing isn't built yet (see the note at the end of this guide).
- **Enquiries** — commission and enquiry volume and outcomes.

Every tab has a date-range picker at the top, and a currency filter where relevant. A notes panel on each page flags anything about the data worth knowing (for example, if figures mix more than one currency).

---

## A note on what isn't built yet

Three sections are visible in some places as concepts but are **not live features**: **Inventory editing** (only the read-only report above exists), **Campaigns**, and **Landing pages**. If you don't see a working page for any of these, that's expected — they're planned for a later phase, not a bug in what's here today.

---

*This guide reflects the admin as it exists in the codebase at the time of writing. If a screen looks different from what's described here, the site has likely been updated since — ask whoever maintains the technical side to keep this guide in sync.*
