'use client'

export default function IdLink({ id, adminEmail }: { id: string; adminEmail: string }) {
  const href = `/admin/request/${id}?email=${encodeURIComponent(adminEmail)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline font-mono text-xs"
      title="Detayı yeni sekmede aç"
    >
      {id}
    </a>
  )
}
