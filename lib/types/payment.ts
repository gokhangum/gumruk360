
export type PaymentRequestStatus = 'pending' | 'approved' | 'needs_fix' | 'rejected';

export interface WorkerOption {
  id: string;
  name: string;
  email?: string | null;
}

export interface PaymentRequestListItem {
  code: string;
  worker_id: string;
  status: PaymentRequestStatus;
  payment_reference?: string | null;
  created_at: string;
  total_settlement?: number | null;
  currency?: 'TRY' | 'USD' | null;
}
