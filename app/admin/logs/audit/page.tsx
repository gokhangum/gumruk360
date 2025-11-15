import LogsTable from "@/components/admin/logs/LogsTable";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Audit Günlükleri</h2>
      <LogsTable endpoint="/api/admin/log?type=audit" />
    </div>
  );
}
