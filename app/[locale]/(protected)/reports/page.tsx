'use client';

import { useEffect, useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { formatCurrency } from '@/lib/utils';

interface PnLData {
  period: string;
  income: {
    total: number;
    breakdown: Array<{ course: string | null; amount: number }>;
  };
  expenses: {
    total: number;
    breakdown: {
      rent: number; utility: number; tax: number; fine: number;
      discount: number; teacher_salary: number; staff_salary: number; other: number;
    };
  };
  profit: number;
  margin: string;
}

interface TeacherSalary {
  id: string;
  teacher_name: string;
  month: string;
  base_amount: number;
  kpi_amount: number;
  total_amount: number;
  paid_at: string | null;
}

interface StaffSalary {
  id: string;
  user_name: string;
  month: string;
  amount: number;
  kpi_amount: number;
  paid_at: string | null;
}

interface Expense {
  id: string;
  category: string;
  source: string;
  amount: number;
  description: string;
  expense_date: string;
}

const EXPENSE_LABELS: Record<string, string> = {
  rent: 'Ijara', utility: 'Kommunal', tax: 'Soliq', fine: 'Jarima',
  discount: 'Chegirma', teacher_salary: "O'qituvchi maoshi",
  staff_salary: 'Xodim maoshi', other: 'Boshqa',
};

export default function ReportsPage() {
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [teacherSalaries, setTeacherSalaries] = useState<TeacherSalary[]>([]);
  const [staffSalaries, setStaffSalaries] = useState<StaffSalary[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingSalaries, setLoadingSalaries] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<{ id: string; amount: string } | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<PnLData>(`/api/v1/profit-loss/?month=${month}`)
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Hisobotni yuklashda xatolik'))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    setLoadingSalaries(true);
    Promise.all([
      api.get<{ results: TeacherSalary[] }>(`/api/v1/teacher-salaries/?month=${month}`),
      api.get<{ results: StaffSalary[] }>(`/api/v1/staff-salaries/?month=${month}`),
      api.get<{ results: Expense[] }>(`/api/v1/expenses/?month=${month}&source=manual`),
    ])
      .then(([t, s, e]) => {
        setTeacherSalaries(t.data.results ?? []);
        setStaffSalaries(s.data.results ?? []);
        setExpenses(e.data.results ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingSalaries(false));
  }, [month]);

  async function handleMarkPaid(id: string) {
    setMarkingPaid(id);
    try {
      const { data: updated } = await api.post<TeacherSalary>(`/api/v1/teacher-salaries/${id}/mark-paid/`);
      setTeacherSalaries((prev) => prev.map((s) => s.id === id ? updated : s));
      toast.success('Maosh to\'langan deb belgilandi');
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setMarkingPaid(null);
    }
  }

  async function handleExpenseSave(id: string) {
    if (!editingExpense) return;
    setSavingExpense(true);
    try {
      const { data: updated } = await api.patch<Expense>(`/api/v1/expenses/${id}/`, {
        amount: parseFloat(editingExpense.amount),
      });
      setExpenses((prev) => prev.map((e) => e.id === id ? updated : e));
      setEditingExpense(null);
      toast.success('Xarajat yangilandi');
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setSavingExpense(false);
    }
  }

  const incomeTotal = data?.income?.total ?? 0;
  const expensesTotal = data?.expenses?.total ?? 0;
  const profit = data?.profit ?? 0;

  const chartData = data ? [
    { name: 'Daromad', value: incomeTotal },
    { name: 'Xarajat', value: expensesTotal },
    { name: 'Foyda', value: profit },
  ] : [];

  const breakdownData = data?.expenses?.breakdown
    ? Object.entries(data.expenses.breakdown).map(([key, val]) => ({
        name: EXPENSE_LABELS[key] ?? key,
        value: typeof val === 'number' ? val : 0,
      }))
    : [];

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Hisobotlar / P&L</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Daromad', value: incomeTotal, color: 'text-green-600' },
          { label: 'Xarajat', value: expensesTotal, color: 'text-red-600' },
          { label: 'Foyda', value: profit, color: profit >= 0 ? 'text-blue-600' : 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded border border-gray-200 shadow-sm p-5">
            <p className="text-sm text-gray-500 mb-1">{label}</p>
            {loading
              ? <Skeleton className="h-7 w-32" />
              : <p className={`text-2xl font-bold ${color}`}>{formatCurrency(value)}</p>
            }
          </div>
        ))}
      </div>

      {data?.margin && !loading && (
        <p className="text-sm text-gray-500">
          Foyda marjasi: <span className="font-semibold text-gray-800">{data.margin}</span>
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Daromad va xarajat</h2>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }}
                  // @ts-expect-error recharts type
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar dataKey="value" fill="#2563EB" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Xarajatlar tafsiloti</h2>
          {loading ? (
            <div className="space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : breakdownData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Ma&apos;lumot yo&apos;q</p>
          ) : (
            <div className="space-y-2">
              {breakdownData.map(({ name, value }) => (
                <div key={name} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-600">{name}</span>
                  <span className={`text-sm font-medium ${value > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                    {formatCurrency(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!loading && (data?.income?.breakdown?.length ?? 0) > 0 && (
        <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Kurslar bo&apos;yicha daromad</h2>
          <div className="space-y-2">
            {(data?.income?.breakdown ?? []).map((row, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{row.course ?? 'Nomsiz kurs'}</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teacher Salaries */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">O&apos;qituvchilar maoshi</h2>
        </div>
        {loadingSalaries ? (
          <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : teacherSalaries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu oy uchun ma&apos;lumot yo&apos;q</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["O'qituvchi", 'Asosiy', 'KPI', 'Jami', 'Holat', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teacherSalaries.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.teacher_name}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(s.base_amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(s.kpi_amount)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(s.total_amount)}</td>
                  <td className="px-4 py-3">
                    {s.paid_at ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded">
                        To&apos;langan
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 rounded">
                        Kutilmoqda
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!s.paid_at && (
                      <button
                        onClick={() => handleMarkPaid(s.id)}
                        disabled={markingPaid === s.id}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        {markingPaid === s.id ? '...' : 'To\'langan deb belgilash'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Staff Salaries */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Xodimlar maoshi</h2>
        </div>
        {loadingSalaries ? (
          <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : staffSalaries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu oy uchun ma&apos;lumot yo&apos;q</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Xodim', 'Summa', 'KPI', 'Holat'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffSalaries.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.user_name}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(s.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(s.kpi_amount)}</td>
                  <td className="px-4 py-3">
                    {s.paid_at ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded">
                        To&apos;langan
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 rounded">
                        Kutilmoqda
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Expenses */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Qo&apos;lda kiritilgan xarajatlar</h2>
        </div>
        {loadingSalaries ? (
          <div className="p-4 space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : expenses.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Bu oy uchun ma&apos;lumot yo&apos;q</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Kategoriya', 'Tavsif', 'Sana', 'Summa', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{EXPENSE_LABELS[e.category] ?? e.category}</td>
                  <td className="px-4 py-3 text-gray-600">{e.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(e.expense_date).toLocaleDateString('uz-UZ')}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {editingExpense?.id === e.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editingExpense.amount}
                          onChange={(ev) => setEditingExpense((x) => x ? { ...x, amount: ev.target.value } : x)}
                          className="w-28 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleExpenseSave(e.id)}
                          disabled={savingExpense}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        >
                          {savingExpense ? '...' : 'Saqlash'}
                        </button>
                        <button
                          onClick={() => setEditingExpense(null)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Bekor
                        </button>
                      </div>
                    ) : (
                      formatCurrency(e.amount)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingExpense?.id !== e.id && (
                      <button
                        onClick={() => setEditingExpense({ id: e.id, amount: String(e.amount) })}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Tahrirlash
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
