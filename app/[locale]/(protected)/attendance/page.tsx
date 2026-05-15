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
  late: number;
  attendance_pct: number;
}

interface AttendanceDay {
  date: string;
  status: string;
  lesson_topic?: string;
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

export default function AttendancePage() {
  const [rows, setRows]         = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      setSelected(new Set());
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

function toggleSelect(id: string) {
  setSelected(prev => {
    const next = new Set(prev);
    // Ternar operator o'rniga if/else ishlatamiz
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
}

  async function openCalendar(row: AttendanceSummaryRow) {
    setCalendar(row);
    setCalDays([]);
    setCalLoading(true);
    try {
      const { data } = await api.get('/api/v1/attendance/', {
        params: { student: row.student_id, page_size: 200 },
      });
      const list = Array.isArray(data) ? data : (data.results ?? []);
      const days: AttendanceDay[] = list.map((a: { lesson_date?: string; lesson?: { date?: string }; status: string; note?: string }) => ({
        date: a.lesson_date ?? a.lesson?.date ?? '',
        status: a.status,
        lesson_topic: a.note ?? '',
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
    if (!smsMsg.trim() || selected.size === 0) return;
    setSendingSms(true);
    try {
      const phones = rows
        .filter(r => selected.has(r.student_id))
        .flatMap(r => {
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
      setSelected(new Set());
    } catch {
      toast.error('SMS yuborishda xatolik');
    } finally {
      setSendingSms(false);
    }
  }

  const STATUS_COLOR: Record<string, string> = {
    present: 'bg-green-500',
    absent: 'bg-red-500',
    late: 'bg-yellow-400',
  };
  const STATUS_LABEL: Record<string, string> = {
    present: 'Keldi',
    absent: 'Kelmadi',
    late: 'Kechikdi',
  };

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarCheck className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Davomat</h1>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setShowSms(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            SMS ({selected.size})
          </button>
        )}
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ism yoki guruh raqami..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['№', '', "O'quvchi", 'Telefon', 'Ota-ona tel', 'Guruh', 'Darslar', 'Davomat %', 'SMS'].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-gray-400">
                  Sababsiz qolgan o&apos;quvchilar topilmadi
                </td>
              </tr>
            ) : rows.map((row, idx) => {
              const missedRatio = row.total > 0 ? row.absent / row.total : 0;
              return (
                <tr
                  key={row.student_id}
                  onClick={() => openCalendar(row)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.student_id)}
                      onChange={() => toggleSelect(row.student_id)}
                      onClick={e => e.stopPropagation()}
                      className="accent-blue-600 w-4 h-4"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.student_name}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={getPhone(row.student_id, 'phone1')}
                        onChange={() => togglePhone(row.student_id, 'phone1')}
                        className="rounded border-gray-300 accent-blue-600 flex-shrink-0"
                      />
                      <span className="text-xs text-gray-600">{formatPhone(row.phone)}</span>
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
                        <span className="text-xs text-gray-500">{formatPhone(row.second_phone)}</span>
                      </label>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{row.group}</p>
                    <p className="text-xs text-gray-400">{row.course}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-sm font-medium tabular-nums', missedRatio > 0.2 ? 'text-red-600' : 'text-gray-700')}>
                      {row.absent}/{row.total}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PctBar pct={row.attendance_pct} />
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setSelected(new Set([row.student_id])); setShowSms(true); }}
                      className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                      title="SMS yuborish"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Calendar Modal */}
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
              <div className="flex items-center gap-4 text-sm">
                <PctBadge pct={calendar.attendance_pct} />
                <span className="text-gray-500">{calendar.present}/{calendar.total} dars</span>
                <span className="text-red-600 font-medium">{calendar.absent} sababsiz</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {Object.entries(STATUS_LABEL).map(([s, l]) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={cn('w-3 h-3 rounded-full', STATUS_COLOR[s])} />
                    {l}
                  </div>
                ))}
              </div>
              {calLoading ? (
                <div className="space-y-2">
                  {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : calDays.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Davomat ma&apos;lumoti topilmadi</p>
              ) : (
                <div className="grid grid-cols-7 gap-1.5">
                  {calDays.map((day, i) => (
                    <div
                      key={i}
                      title={`${day.date} — ${STATUS_LABEL[day.status]}`}
                      className={cn(
                        'aspect-square rounded flex items-center justify-center text-xs font-medium text-white cursor-default',
                        STATUS_COLOR[day.status] ?? 'bg-gray-200',
                      )}
                    >
                      {new Date(day.date).getDate()}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    const cal = calendar;
                    setCalendar(null);
                    setSelected(new Set([cal.student_id]));
                    setShowSms(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" />
                  SMS yuborish
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SMS Modal */}
      <Dialog open={showSms} onOpenChange={setShowSms}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SMS yuborish — {selected.size} ta o&apos;quvchi</DialogTitle>
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
              <button
                type="button"
                onClick={() => setShowSms(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={sendingSms || !smsMsg.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60"
              >
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
