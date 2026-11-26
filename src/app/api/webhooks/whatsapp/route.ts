import { NextResponse, type NextRequest } from "next/server";
import { isWhatsAppWebhookConfigured, serverEnv } from "@/lib/server-env";
import { handleInboundWhatsApp, verifyMetaSignature } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verificación del webhook que hace Meta al configurarlo. */
export async function GET(request: NextRequest) {
  if (!isWhatsAppWebhookConfigured()) {
    return NextResponse.json({ error: "Webhook de WhatsApp no configurado" }, { status: 503 });
  }
  const p = request.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === serverEnv.whatsappVerifyToken) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Token inválido" }, { status: 403 });
}

/** Mensajes entrantes. Solo se procesan si la firma de Meta es válida. */
export async function POST(request: NextRequest) {
  if (!isWhatsAppWebhookConfigured()) {
    return NextResponse.json({ error: "Webhook de WhatsApp no configurado" }, { status: 503 });
  }
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }
  try {
    const processed = await handleInboundWhatsApp(JSON.parse(raw));
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error("[whatsapp-webhook]", e);
    // 200 para que Meta no reintente indefinidamente un payload que no podemos procesar
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
