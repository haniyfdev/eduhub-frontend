import Sidebar from '@/components/sidebar';
import Topbar from '@/components/topbar';
import AuthGuard from '@/components/auth-guard';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
