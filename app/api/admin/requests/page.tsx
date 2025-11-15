// app/admin/requests/page.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { isAdmin } from '@/lib/auth/requireAdmin'

export const dynamic = 'force-dynamic'

type SearchParams = { email?: string }

export default async function AdminRequestsPage({ searchParams }: { searchParams?: SearchParams }) {
  const email = (searchParams?.email || '').toString()
  if (!isAdmin(email)) {
    // burada gerçek session'a bağlayacağız; şimdilik MVP
    redirect('/')
  }

  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('id, title, status, answer_status, claim_status, assigned_to, paid_at, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Questions fetch failed: ${error.message}`)
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-1">Admin / Requests</h1>
      <p className="text-sm mb-4">Admin: <b>{email}</b></p>

      <div className="mb-4">
        <Link
          className="underline"
          href={`/api/admin/health?email=${encodeURIComponent(email)}`}
          target="_blank"
        >
          API Health (admin)
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[800px] border border-gray-300 border-collapse">
          <thead>
            <tr className="[&>th]:border [&>th]:border-gray-300 [&>th]:p-2 bg-gray-50 text-left">
              <th>ID</th>
              <th>Başlık</th>
              <th>Status</th>
              <th>Answer</th>
              <th>Claim</th>
              <th>Assigned To</th>
              <th>Paid At</th>
              <th>Detay</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).length > 0 ? (
              data!.map((r) => (
                <tr key={r.id} className="[&>td]:border [&>td]:border-gray-200 [&>td]:p-2">
                  <td className="font-mono text-xs">{r.id}</td>
                  <td>{r.title || '-'}</td>
                  <td>{r.status || '-'}</td>
                  <td>{r.answer_status || '-'}</td>
                  <td>{r.claim_status || '-'}</td>
                  <td className="font-mono text-xs">{r.assigned_to || '-'}</td>
                  <td className="font-mono text-xs">{r.paid_at || '-'}</td>
                  <td>
                    {/* Detay sayfasını sprint 2'de ekleyeceğiz */}
                    <span className="opacity-60">—</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-4 text-center text-sm text-gray-500">Kayıt yok</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Not: Sprint 2’de onay/red, assign/claim ve taslak akışları eklenecek.
      </p>
    </main>
  )
}
