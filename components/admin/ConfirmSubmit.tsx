"use client";
import { useRef } from "react";

export default function ConfirmSubmit({
  id, action, label, confirmText, className = ""
}: { id: string; action: string; label: string; confirmText: string; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} method="POST" className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        className={className}
        onClick={() => { if (confirm(confirmText)) ref.current?.submit(); }}
      >
        {label}
      </button>
    </form>
  );
}
