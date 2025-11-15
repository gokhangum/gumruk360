import * as React from 'react';

export function Segmented({ items, value, onChange, className = '' }:{ items: string[]; value: string; onChange:(v:string)=>void; className?: string }) {
  return (
    <div className={['inline-flex rounded-xl bg-slate-100 p-1', className].join(' ')} role="tablist">
      {items.map((it) => {
        const active = it === value;
        return (
          <button
            type="button"
            key={it}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it)}
            className={['px-3 h-9 rounded-lg text-sm font-semibold transition-all', active ? 'bg-white shadow-soft' : 'text-slate-600'].join(' ')}
          >
            {it}
          </button>
        );
      })}
    </div>
  );
}
