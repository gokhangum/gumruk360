// app/api/admin/cleanup/order-payment/delete/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

type Req = {
  delete_orders?: string[];   // order ids
  delete_payments?: string[]; // payment ids
};

const CHUNK = 200;

async function chunkedDelete(table: "orders" | "payments", idField: "id", ids: string[]) {
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { error, count } = await supabaseAdmin
      .from(table)
      .delete({ count: "exact" })
      .in(idField, part);
    if (error) {
      return { ok: false as const, error: `${table} delete failed: ${error.message}`, chunk: i / CHUNK, partial: total };
    }
    total += count ?? 0;
  }
  return { ok: true as const, deleted: total };
}

export async function POST(req: Request) {
  try {
    // TODO: Admin/owner guard here.
    const body = (await req.json()) as Req;
    const deleteOrders = Array.isArray(body.delete_orders) ? [...new Set(body.delete_orders)] : [];
    const deletePayments = Array.isArray(body.delete_payments) ? [...new Set(body.delete_payments)] : [];

    const result: any = { ok: true, requested_orders: deleteOrders.length, requested_payments: deletePayments.length };

  if (deleteOrders.length) {
     const r = await chunkedDelete("orders", "id", deleteOrders);
      if (!r.ok) return NextResponse.json({ stage: "orders", ...r }, { status: 500 });
    result.deleted_orders = r.deleted;

    } else {
      result.deleted_orders = 0;
    }

   if (deletePayments.length) {
    const r = await chunkedDelete("payments", "id", deletePayments);
      if (!r.ok) return NextResponse.json({ stage: "payments", ...r }, { status: 500 });
     result.deleted_payments = r.deleted;

    } else {
      result.deleted_payments = 0;
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e), stage: "exception" }, { status: 500 });
  }
}
