"use client";

import { useState, useTransition } from "react";
import { Dialog } from "./dialog";
import { Button, type ButtonProps } from "./button";
import { Alert } from "./alert";
import type { ActionResult } from "@/lib/types";

/** Botón que pide confirmación antes de ejecutar una acción destructiva. */
export function ConfirmButton({
  action,
  title,
  description,
  confirmLabel = "Eliminar",
  children,
  ...buttonProps
}: {
  action: () => Promise<ActionResult | void>;
  title: string;
  description: string;
  confirmLabel?: string;
} & ButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" {...buttonProps} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} title={title} description={description}>
        {error && <Alert tone="error" className="mb-4">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await action();
                if (res && !res.ok) setError(res.error);
                else setOpen(false);
              })
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
