// components/payments/CheckoutClientDemo.tsx
"use client";
import { useState } from "react";
import PaddleBoot from "./PaddleBoot";
import PaddleCheckoutOverlay from "./PaddleCheckoutOverlay";

export default function CheckoutClientDemo() {
  const [txn, setTxn] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/paddle/with-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope_type: "user",
          credits: 30,
          pricing_snapshot: { currency: "USD", unit_price_ccy: 23.8, total_ccy: 715.2 },
        }),
      });
      const json = await res.json();
      if (json?.ok && json?.data?.transaction_id) {
        setTxn(json.data.transaction_id);
      } else {
        console.error("with-credits failed", json);
        alert("Checkout can not be started");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <PaddleBoot />
      <button disabled={loading} onClick={start} className="px-4 py-2 rounded bg-blue-600 text-white">
        {loading ? "Starting..." : "Proceed to Payment"}
      </button>
      {txn && (
        <PaddleCheckoutOverlay
          transactionId={txn}
          autoOpen
          theme="light"
          onClose={() => setTxn(null)}
        />
      )}
    </div>
  );
}
