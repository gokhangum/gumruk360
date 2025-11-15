// lib/payments/paddle.ts
import { createHmac, timingSafeEqual } from "crypto";

export type CreateCheckoutInput = {
  amountCents: number;
  currency: "USD";
  email?: string;
  orderId: string;
  metadata?: Record<string, any>;
  returnUrl: string;
  cancelUrl: string;
  quantity: number;
  productName?: string;
};

export type CreateCheckoutOutput = {
  checkout_url: string | null;
  transaction_id: string | null;
};

const PADDLE_ENV = (process.env.PADDLE_ENV || "sandbox").toLowerCase();
const API_BASE = PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

const PADDLE_SANDBOX_API_KEY = (process.env.PADDLE_SANDBOX_API_KEY || "").trim();
const PADDLE_LIVE_API_KEY = (process.env.PADDLE_LIVE_API_KEY || "").trim();
const PADDLE_SECRET_KEY = PADDLE_ENV === "live" ? PADDLE_LIVE_API_KEY : PADDLE_SANDBOX_API_KEY;
if (!PADDLE_SECRET_KEY) throw new Error("[paddle] API key missing for current PADDLE_ENV");

const PADDLE_PRODUCT_ID_CREDITS = (process.env.PADDLE_PRODUCT_ID_CREDITS || "").trim();
if (!PADDLE_PRODUCT_ID_CREDITS) throw new Error("[paddle] product id missing (PADDLE_PRODUCT_ID_CREDITS)");

export function getEnv() { return { env: PADDLE_ENV, apiBase: API_BASE }; }

function assertPositiveInt(n: number, name: string) {
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new Error(`[paddle] ${name} must be a positive integer`);
}

async function toApiError(res: Response) {
  const text = await res.text().catch(() => "");
  const hint = res.status === 403 ? "forbidden: check Paddle-Version header, API key"
            : res.status === 401 ? "unauthorized: bearer token missing/invalid"
            : `http_${res.status}`;
  const msg = text || `paddle_${hint}`;

  throw new Error(msg);
}

/** Create transaction with inline (non-catalog) price to support dynamic totals. */
export async function createCheckoutViaTransaction(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
  const { amountCents, currency, email, orderId, metadata, returnUrl, cancelUrl, quantity, productName } = input;
  assertPositiveInt(quantity, "quantity");
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("[paddle] amountCents must be > 0");

  const perUnitCents = Math.max(1, Math.round(amountCents / quantity));
  const customer = email ? { email } : undefined;
  const custom_data = { orderId };
  const meta = { ...(metadata || {}), orderId };
  const priceDescription = productName || "Buy Credits";

  const items = [{
    price: {
      description: priceDescription,
      unit_price: { amount: String(perUnitCents), currency_code: currency },
      product_id: PADDLE_PRODUCT_ID_CREDITS,
    },
    quantity,
  }];

  const body: any = {
    items,
    customer,
    metadata: meta,
    custom_data,
    currency_code: currency,
    collection_mode: "automatic",
    checkout: { success_url: returnUrl, cancel_url: cancelUrl },
  };

  const r = await fetch(`${API_BASE}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${PADDLE_SECRET_KEY}`,
      "Paddle-Version": "1",
    } as any,
    body: JSON.stringify(body),
  });

  const txt = await r.text().catch(() => "");
  let j: any = {};
  try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt?.slice(0, 500) }; }
  if (!r.ok) {
    throw new Error(txt || `http_${r.status}`);
  }
  const id = j?.data?.id ?? null;
   return { checkout_url: null, transaction_id: id };
 }
 
 // --- Webhook signature verify (Paddle v2) ---
 export function verifyWebhookSignature(rawBody: string, sigHeader: string | null): boolean {
   // Geliştirme ortamında hızlı test için baypas (opsiyonel)
  if (process.env.ALLOW_UNVERIFIED_PADDLE_WEBHOOKS === "1") return true;
 
   const secret = process.env.PADDLE_WEBHOOK_SECRET || "";
  if (!secret) return false;
  if (!sigHeader) return false;

   // Header örnekleri: "ts=1730165341; h1=<hex>" veya "t=...; h1=..."
   const norm = sigHeader.replace(/,/g, ";");
   const parts: Record<string, string> = {};
  for (const seg of norm.split(";")) {
    const [k, v] = seg.split("=").map(s => (s || "").trim());
    if (k && v) parts[k.toLowerCase()] = v;
  }
  const ts = parts["ts"] || parts["t"] || "";
 const h1 = (parts["h1"] || parts["signature"] || "").toLowerCase();
 if (!h1) return false;

 // Yaygın hesap: HMAC-SHA256(secret, ts + ":" + rawBody) → hex
   const payload = ts ? `${ts}:${rawBody}` : rawBody;
  const mac = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
 
  try {
   const a = Buffer.from(mac, "hex");
   const b = Buffer.from(h1, "hex");
   if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
   } catch {
    return false;
  }
 }
