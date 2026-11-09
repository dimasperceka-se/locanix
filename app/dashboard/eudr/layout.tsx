import EudrSidebar from "@/components/EudrSidebar";

export default function EudrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <EudrSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
