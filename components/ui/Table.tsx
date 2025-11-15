import * as React from 'react';

export function TableSurface({ className = '', children }:{ className?: string; children: React.ReactNode }) {
  return <div className={['table-surface', className].join(' ')}>{children}</div>;
}
