// lib/precheck.ts
// Helpers for Precheck layers.

export type PrecheckStatus = 'passed' | 'meaningless' | 'non_customs' | 'error';

export type PrecheckResponse = {
  ok: boolean;
  status: PrecheckStatus;
  confidence?: number;
  result?: any;
};

export async function runPrecheck(questionId: string, locale: 'tr' | 'en' = 'tr'): Promise<PrecheckResponse> {
  const res = await fetch('/api/gpt/precheck/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, locale }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || 'PRECHECK_ERROR';
    throw new Error(msg);
  }
  return data as PrecheckResponse;
}

export type PrecheckL2Response = {
  ok: boolean;
  status: 'ok' | 'error';
  result?: any;
};

export async function runPrecheckL2(questionId: string, locale: 'tr' | 'en' = 'tr'): Promise<PrecheckL2Response> {
  const res = await fetch('/api/gpt/precheck/l2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, locale }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || 'PRECHECK_L2_ERROR';
    throw new Error(msg);
  }
  return data as PrecheckL2Response;
}
