import * as React from 'react';

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = '', ...rest } = props;
  return <div className={['card-surface', className].join(' ')} {...rest} />;
}
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = '', ...rest } = props;
  return <div className={['px-5 py-4 border-b border-slate-100 flex items-center gap-2', className].join(' ')} {...rest} />;
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = '', ...rest } = props;
  return <div className={['p-5', className].join(' ')} {...rest} />;
}
export function CardFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = '', ...rest } = props;
  return <div className={['px-5 py-4 border-t border-slate-100', className].join(' ')} {...rest} />;
}
