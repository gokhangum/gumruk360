import * as React from 'react';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function Badge({ tone = 'muted', className = '', ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={['badge', `badge--${tone}`, className].join(' ')} {...props} />;
}
