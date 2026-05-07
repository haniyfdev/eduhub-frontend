'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import api from '@/lib/axios';
import { formatCurrency } from '@/lib/utils';

interface OverdueDebt {
  id: string;
  student_name: string;
  amount: number;
  due_date: string;
}

export default function NotificationBell() {
  const locale = useLocale();
  const [count, setCount] = useState(0);
  const [debts, setDebts] = useState<OverdueDebt[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function fetchOverdue() {
    try {
      setLoading(true);
      const { data } = await api.get('/api/v1/debts/', {
        params: { status: 'overdue', page_size: 5 },
      });
      setCount(data.count ?? 0);
      setDebts(data.results ?? []);
    } catch {
      // silent — bell should not break the page
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOverdue();
    const interval = setInterval(fetchOverdue, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function daysOverdue(dueDate: string) {
    const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="Bildirishnomalar"
      >
        <Bell className={`w-5 h-5 ${count > 0 ? 'text-gray-600' : 'text-green-500'}`} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Bildirishnomalar</h3>
            {count > 0 && (
              <span className="text-xs font-medium text-red-500">{count} ta muddati o&apos;tgan</span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : debts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Muddati o&apos;tgan qarz yo&apos;q</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {debts.map((d) => (
                  <div key={d.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{d.student_name}</p>
                        <p className="text-xs text-red-400 mt-0.5">
                          {daysOverdue(d.due_date)} kun muddati o&apos;tgan
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                        {formatCurrency(d.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100">
            <Link
              href={`/${locale}/debts`}
              onClick={() => setOpen(false)}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Barchasini ko&apos;rish →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
