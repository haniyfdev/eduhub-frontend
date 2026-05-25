import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'danger' | 'success';
  trend?: number;
}

const variants = {
  default: { bar: 'bg-blue-500',    iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    valueColor: 'text-gray-900' },
  danger:  { bar: 'bg-red-500',     iconBg: 'bg-red-50',     iconColor: 'text-red-500',     valueColor: 'text-red-600'  },
  success: { bar: 'bg-emerald-500', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', valueColor: 'text-gray-900' },
};

export default function StatCard({ label, value, icon: Icon, variant = 'default', trend }: StatCardProps) {
  const v = variants[variant];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={cn('h-1', v.bar)} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
            <p className={cn('text-2xl font-bold mt-2 leading-none', v.valueColor)}>{value}</p>
            {trend !== undefined && (
              <p className={cn('text-xs mt-2 font-medium', trend >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% bu oy
              </p>
            )}
          </div>
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', v.iconBg)}>
            <Icon className={cn('w-5 h-5', v.iconColor)} />
          </div>
        </div>
      </div>
    </div>
  );
}
