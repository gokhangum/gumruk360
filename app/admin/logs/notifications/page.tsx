// app/admin/logs/notifications/page.tsx
import LogsTable from "@/components/admin/logs/LogsTable";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function NotificationsPage({ searchParams = {} }: PageProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Bildirim Günlükleri</h2>
      <LogsTable endpoint="/api/admin/log?type=notifications" />
    </div>
  );
}
