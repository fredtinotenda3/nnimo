/**
 * Share links: WhatsApp, Facebook, X.
 *
 * Plain `<a>` tags to each platform's own share-intent URL — no external SDK,
 * per the brief. `url` must already be absolute (see lib/seo.ts absoluteUrl);
 * a relative path shared to WhatsApp would just be a broken link on the
 * recipient's phone.
 */
export function ShareLinks({ url, title, className }: { url: string; title: string; className?: string }) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const links = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    },
  ];

  return (
    <div className={className}>
      <span className="text-label mr-3 text-muted-foreground">Share</span>
      <span className="inline-flex items-center gap-4">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-sm underline decoration-muted-foreground/40 underline-offset-4 hover:text-primary hover:decoration-primary"
          >
            {link.label}
          </a>
        ))}
      </span>
    </div>
  );
}
