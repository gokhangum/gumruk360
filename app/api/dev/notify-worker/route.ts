import { NextRequest, NextResponse } from "next/server";
import { notifyWorkerOnAssignment } from "@/lib/mailer/notifyWorkerOnAssignment";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const questionId = searchParams.get("question_id") || "";
  const method = (searchParams.get("method") || "Paytr") as "Paytr" | "Kredi";
  const amountCents = Number(searchParams.get("amount_cents") || "0");
  const creditAmount = Number(searchParams.get("credits") || "0");
  const tenantId = searchParams.get("tenant_id");
  const force = searchParams.get("force") === "1";

  if (!questionId) {
    return NextResponse.json({ ok: false, error: "question_id required" }, { status: 400 });
  }

  const out = await notifyWorkerOnAssignment({
    questionId,
    method,
    amountCents,
    creditAmount,
    tenantId,
    force
  });

  return NextResponse.json({ ok: true, ...out });
}
