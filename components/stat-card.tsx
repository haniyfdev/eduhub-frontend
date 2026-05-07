import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'danger' | 'success';
  trend?: number;
}

export default function StatCard({ label, value, icon: Icon, variant = 'default', trend }: StatCardProps) {
  const iconBg = variant === 'danger' ? 'bg-red-50' : variant === 'success' ? 'bg-green-50' : 'bg-blue-50';
  const iconColor = variant === 'danger' ? 'text-red-500' : variant === 'success' ? 'text-green-600' : 'text-blue-600';
  const valueColor = variant === 'danger' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <div className={cn('w-9 h-9 rounded flex items-center justify-center', iconBg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
      </div>
      <p className={cn('text-2xl font-bold', valueColor)}>
        {value}
      </p>
      {trend !== undefined && (
        <p className={cn('text-xs mt-1', trend >= 0 ? 'text-green-600' : 'text-red-500')}>
          {trend >= 0 ? '+' : ''}{trend}% bu oy
        </p>
      )}
    </div>
  );
}
