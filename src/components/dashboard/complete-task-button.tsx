"use client";

import { useTransition, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { completeTask } from "@/app/actions/tasks";

export function CompleteTaskButton({ taskId, disabled }: { taskId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const res = await completeTask(taskId);
            setError(res.ok ? null : res.error);
          })
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-success-500 hover:text-success-700 disabled:opacity-50"
        title="Marcar como completada"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Hecho
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
