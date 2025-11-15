import * as React from 'react';
import Link from 'next/link';

export function SidebarItem({ href, icon, children, active }:{ href: string; icon?: React.ReactNode; children: React.ReactNode; active?: boolean }) {
  return (
    <Link href={href} className={[
      'flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition',
      active ? 'bg-slate-100 text-slate-900 ring-1 ring-slate-200' : ''
    ].join(' ')}>
      <span className="w-5 h-5 shrink-0">{icon}</span>
      <span className="font-medium">{children}</span>
    </Link>
  );
}
