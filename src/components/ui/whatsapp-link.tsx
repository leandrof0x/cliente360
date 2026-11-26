import { MessageCircle } from "lucide-react";
import { waNumber } from "@/lib/crm";
import { cn } from "@/lib/utils";

/** Abre la conversación en WhatsApp (wa.me). No envía nada automáticamente. */
export function WhatsAppLink({
  number,
  text,
  label,
  className,
}: {
  number: string | null | undefined;
  text?: string;
  label?: string;
  className?: string;
}) {
  const n = waNumber(number);
  if (!n) return null;
  const href = `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-success-700 hover:text-success-600",
        className,
      )}
      title="Abrir WhatsApp"
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      {label ?? <span className="sr-only">WhatsApp</span>}
    </a>
  );
}
