export default function AdminEditLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[clamp(320px,95vw,1100px)] p-4 md:p-6">
      {children}
    </main>
  );
}
