'use client';

import { useEffect, useState, useCallback } from 'react';
import { CalendarCheck, Search, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import { cn, formatPhone } from '@/lib/utils';

interface AttendanceSummaryRow {
  student_id: string;
  student_name: string;
  phone: string;
  second_phone: string | null;
  group: string;
  course: string;
  total: number;
  present: number;
  absent: number;
  attendance_pct: number;
}

interface AttendanceDay {
  date: string;
  status: string;
  note?: string | null;
}

function PctBadge({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? 'bg-green-100 text-green-700' :
    pct >= 60 ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-700';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold', color)}>
      {pct}%
    </span>
  );
}

function PctBar({ pct }: { pct: number }) {
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-500';
  const textColor = pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-yellow-700' : 'text-red-600';
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-xs font-semibold w-8 text-right tabular-nums', textColor)}>{pct}%</span>
    </div>
  );
}

// absent/total foiziga qarab rang:
// > 80% davomat => oq (normal)
// 61-80% => juda och qizil
// <= 60% => medium qizil
function rowBg(pct: number): string {
  if (pct > 80) return '';
  if (pct > 60) return 'bg-red-50';
  return 'bg-red-100';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

const STATUS_COLOR: Record<string, string> = {
  present: 'bg-green-500',
  absent:  'bg-red-500',
  late:    'bg-yellow-400',
};
const STATUS_LABEL: Record<string, string> = {
  present: 'Keldi',
  absent:  'Kelmadi',
  late:    'Kechikdi',
};

export default function AttendancePage() {
  const [rows, setRows]         = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [phoneTargets, setPhoneTargets] = useState<Record<string, { phone1: boolean; phone2: boolean }>>({});
  const [calendar, setCalendar]         = useState<AttendanceSummaryRow | null>(null);
  const [calDays, setCalDays]           = useState<AttendanceDay[]>([]);
  const [calLoading, setCalLoading]     = useState(false);
  const [showSms, setShowSms]           = useState(false);
  const [smsMsg, setSmsMsg]             = useState('');
  const [sendingSms, setSendingSms]     = useState(false);

  const fetchSummary = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.search = q;
      const { data } = await api.get('/api/v1/attendance/summary/', { params });
      const list: AttendanceSummaryRow[] = Array.isArray(data) ? data : (data.results ?? []);
      setRows(list);
    } catch {
      toast.error("Davomat ma'lumotlarini yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchSummary(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, fetchSummary]);

  function getPhone(sid: string, which: 'phone1' | 'phone2'): boolean {
    return phoneTargets[sid]?.[which] ?? false;
  }

  function togglePhone(sid: string, which: 'phone1' | 'phone2') {
    setPhoneTargets(prev => ({
      ...prev,
      [sid]: {
        phone1: prev[sid]?.phone1 ?? false,
        phone2: prev[sid]?.phone2 ?? false,
        [which]: !(prev[sid]?.[which] ?? false),
      },
    }));
  }

  const checkedPhoneCount = rows.reduce((acc, r) => {
    if (phoneTargets[r.student_id]?.phone1) acc++;
    if (r.second_phone && phoneTargets[r.student_id]?.phone2) acc++;
    return acc;
  }, 0);

  async function openCalendar(row: AttendanceSummaryRow) {
    setCalendar(row);
    setCalDays([]);
    setCalLoading(true);
    try {
      const { data } = await api.get('/api/v1/attendance/', {
        params: { student: row.student_id, page_size: 200 },
      });
      const list = Array.isArray(data) ? data : (data.results ?? []);
      const days: AttendanceDay[] = list.map((a: {
        lesson_date?: string;
        lesson?: { date?: string };
        status: string;
        note?: string;
      }) => ({
        date: a.lesson_date ?? a.lesson?.date ?? '',
        status: a.status,
        note: a.note ?? null,
      }));
      days.sort((a, b) => a.date.localeCompare(b.date));
      setCalDays(days);
    } catch {
      toast.error('Davomat tarixini yuklashda xatolik');
    } finally {
      setCalLoading(false);
    }
  }

  async function handleSms(e: React.FormEvent) {
    e.preventDefault();
    if (!smsMsg.trim()) return;
    setSendingSms(true);
    try {
      const phones = rows.flatMap(r => {
        const list: string[] = [];
        if (getPhone(r.student_id, 'phone1')) list.push(r.phone);
        if (r.second_phone && getPhone(r.student_id, 'phone2')) list.push(r.second_phone);
        return list;
      });
      await Promise.all(
        phones.map(phone =>
          api.post('/api/v1/notifications/send-sms/', { phone, message: smsMsg }).catch(() => null)
        )
      );
      toast.success('SMS yuborildi');
      setShowSms(false);
      setSmsMsg('');
      setPhoneTargets({});
    } catch {
      toast.error('SMS yuborishda xatolik');
    } finally {
      setSendingSms(false);
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarCheck className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Davomat</h1>
        </div>
        {checkedPhoneCount > 0 && (
          <button
            onClick={() => setShowSms(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            SMS ({checkedPhoneCount})
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ism yoki guruh raqami..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Main table */}
      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["№", "O'quvchi", 'Telefon', 'Ota-ona tel', 'Guruh', 'Darslar', 'Davomat %'].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(7).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                  Davomat ma&apos;lumoti topilmadi
                </td>
              </tr>
            ) : rows.map((row, idx) => (
              <tr
                key={row.student_id}
                onClick={() => openCalendar(row)}
                className={cn('cursor-pointer transition-colors hover:brightness-95', rowBg(row.attendance_pct))}
              >
                <td className="px-4 py-3 text-gray-500 text-xs">{idx + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{row.student_name}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={getPhone(row.student_id, 'phone1')}
                      onChange={() => togglePhone(row.student_id, 'phone1')}
                      className="rounded border-gray-300 accent-blue-600 flex-shrink-0"
                    />
                    <span className="text-sm font-medium text-gray-900">{formatPhone(row.phone)}</span>
                  </label>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {row.second_phone ? (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={getPhone(row.student_id, 'phone2')}
                        onChange={() => togglePhone(row.student_id, 'phone2')}
                        className="rounded border-gray-300 accent-blue-600 flex-shrink-0"
                      />
                      <span className="text-sm font-medium text-gray-900">{formatPhone(row.second_phone)}</span>
                    </label>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">{row.group}</p>
                  <p className="text-xs text-gray-500">{row.course}</p>
                </td>
                {/* absent/total — qoldirgan/jami */}
                <td className="px-4 py-3">
                  <span className={cn('text-sm font-medium tabular-nums',
                    row.absent / row.total > 0.5 ? 'text-red-600' : 'text-gray-700')}>
                    {row.absent}/{row.total}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PctBar pct={row.attendance_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal — yangi oyna */}
      <Dialog open={!!calendar} onOpenChange={() => setCalendar(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-blue-600" />
              {calendar?.student_name}
            </DialogTitle>
          </DialogHeader>

          {calendar && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <PctBadge pct={calendar.attendance_pct} />
                <span className="text-gray-500">{calendar.present}/{calendar.total} dars</span>
                <span className="text-red-600 font-medium">{calendar.absent} dars qoldirildi</span>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {Object.entries(STATUS_LABEL).map(([s, l]) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={cn('w-2.5 h-2.5 rounded-full', STATUS_COLOR[s])} />
                    {l}
                  </div>
                ))}
              </div>

              {/* Table */}
              {calLoading ? (
                <div className="space-y-2">
                  {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : calDays.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Davomat ma&apos;lumoti topilmadi</p>
              ) : (
                <table className="w-full text-sm border border-gray-100 rounded overflow-hidden">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="text-left px-3 py-2 font-semibold">№</th>
                      <th className="text-left px-3 py-2 font-semibold">Sana</th>
                      <th className="text-left px-3 py-2 font-semibold">Holat</th>
                      <th className="text-left px-3 py-2 font-semibold">Izoh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {calDays.map((day, i) => {
                      const isAbsent = day.status === 'absent';
                      const isLate   = day.status === 'late';
                      return (
                        <tr
                          key={i}
                          className={cn(
                            isAbsent ? 'bg-red-50' : isLate ? 'bg-yellow-50' : 'bg-green-50'
                          )}
                        >
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {formatDate(day.date)}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              'inline-flex items-center gap-1.5 text-xs font-semibold',
                              isAbsent ? 'text-red-600' : isLate ? 'text-yellow-600' : 'text-green-600'
                            )}>
                              <div className={cn('w-2 h-2 rounded-full', STATUS_COLOR[day.status])} />
                              {STATUS_LABEL[day.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{day.note || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SMS Modal */}
      <Dialog open={showSms} onOpenChange={setShowSms}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SMS yuborish — {checkedPhoneCount} ta raqam</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSms} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Xabar <span className="text-red-500">*</span>
              </label>
              <textarea
                value={smsMsg}
                onChange={e => setSmsMsg(e.target.value)}
                rows={4}
                required
                placeholder="SMS matni..."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{smsMsg.length} belgi</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowSms(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50">
                Bekor qilish
              </button>
              <button type="submit" disabled={sendingSms || !smsMsg.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
                <Send className="w-4 h-4" />
                {sendingSms ? 'Yuborilmoqda...' : 'Yuborish'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}