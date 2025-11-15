import Link from "next/link";

export default function AdminLogsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Admin Log</h1>
      <nav className="flex gap-3 text-sm">
        <Link className="btn btn-outline" href="/admin/logs/notifications">
          Bildirimler
        </Link>
        <Link className="btn btn-outline" href="/admin/logs/audit">
          Audit
        </Link>
      </nav>
      <div>{children}</div>
    </div>
  );
}
