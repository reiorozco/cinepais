import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Exists only to give `/checkout` a title.
 *
 * `checkout/page.tsx` is a client component (it reads the selection from
 * React context), and a `"use client"` module cannot export `metadata` — a
 * segment layout is the only mechanism Next offers. `/checkout/confirmation`
 * is a server component and overrides this with its own title.
 */
export const metadata: Metadata = {
  title: "Resumen de compra",
  description:
    "Revisa tus boletas antes de confirmar. CinePaís es una demo: no se realiza ningún cobro.",
};

export default function CheckoutLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
