import Link from "next/link";

/**
 * Global page footer.
 *
 * Server component. Uses `--surface-dark` (one step lighter than
 * `--brand-header`) so the footer sits below the catalog surface without
 * echoing the top nav exactly.
 *
 * Every link here is a non-functional placeholder (href="#"): this is a
 * portfolio demo with mock data, so we render the shape of the real footer
 * (legal + social) without pretending the endpoints exist.
 *
 * Social icons are inline SVGs (`currentColor`-driven), not a brand-icon
 * package: lucide-react 1.x dropped brand marks and pulling in a second
 * icon dep for three static glyphs is not worth the weight in a demo.
 */
export function Footer() {
  return (
    <footer className="bg-surface-dark text-white/85">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-white/70">
          © 2026 CinePaís — Proyecto de portafolio. Datos ficticios.
        </p>

        <nav aria-label="Enlaces legales" className="flex items-center gap-6">
          <Link
            href="#"
            className="text-sm text-white/70 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:underline underline-offset-4"
          >
            Términos
          </Link>
          <Link
            href="#"
            className="text-sm text-white/70 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:underline underline-offset-4"
          >
            Privacidad
          </Link>
        </nav>

        <ul aria-label="Redes sociales" className="flex items-center gap-2">
          <li>
            <SocialLink label="CinePaís en Facebook">
              <FacebookIcon />
            </SocialLink>
          </li>
          <li>
            <SocialLink label="CinePaís en Instagram">
              <InstagramIcon />
            </SocialLink>
          </li>
          <li>
            <SocialLink label="CinePaís en X">
              <XIcon />
            </SocialLink>
          </li>
        </ul>
      </div>
    </footer>
  );
}

function SocialLink({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href="#"
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      {children}
    </Link>
  );
}

// Icon paths adapted from Simple Icons (CC0). Each glyph is a single filled
// path; the wrapper picks the size and inherits color from the surrounding
// link via `currentColor` on the fill.
function FacebookIcon() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
    >
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12S0 5.417 0 12.044c0 5.628 3.874 10.35 9.101 11.647z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
    >
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793 0 1.44.645 1.44 1.439z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
