'use client';
import React from 'react';
export default function TenantBadge({ tenantCode, host }:{ tenantCode:string, host?:string }){
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs opacity-80">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      tenant: <strong>{tenantCode}</strong>
      {host ? <em className="opacity-60">({host})</em> : null}
    </span>
  );
}
