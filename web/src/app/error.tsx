"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        Algo salió mal
      </h1>
      <p className="text-muted-foreground max-w-sm">
        Ocurrió un error inesperado. Vuelve a intentarlo.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
