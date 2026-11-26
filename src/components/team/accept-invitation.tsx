"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvitation(token);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        Aceptar y entrar
      </Button>
    </div>
  );
}
