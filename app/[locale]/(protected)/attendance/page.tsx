'use client';

import { useEffect, useState, useCallback } from 'react';
import { CalendarCheck, Search, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserTable, ColumnDef } from '@/components/user-table';
import api from '@/lib/axios';
import { cn, formatPhone } from '@/lib/utils';

interface AttendanceSummaryRow {
  student_id: string;
  student_name: string;
  phone: string;
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

export default function AttendancePage() {
  const [rows, setRows]           = useState<AttendanceSummaryRow[]>([]);
  const [filtered, setFiltered]   = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [calendar, setCalendar]   = useState<AttendanceSummaryRow | null>(null);
  const [calDays, setCalDays]     = useState<AttendanceDay[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [showSms, setShowSms]     = useState(false);
  const [smsMsg, setSmsMsg]       = useState('');
  const [sendingSms, setSendingSms] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/v1/attendance/summary/');
      const list: AttendanceSummaryRow[] = Array.isArray(data) ? data : (data.results ?? []);
      setRows(list);
      setFiltered(list);
    } catch {
      toast.error('Davomat ma\'lumotlarini yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? rows.filter(
            (r) =>
              r.student_name.toLowerCase().includes(q) ||
              r.phone.includes(q) ||
              r.group.toLowerCase().includes(q),
          )
        : rows,
    );
  }, [search, rows]);

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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.student_id)));
    }
  }

  async function handleBulkSms(e: React.FormEvent) {
    e.preventDefault();
    if (!smsMsg.trim() || selected.size === 0) return;
    setSendingSms(true);
    try {
      const targets = filtered.filter((r) => selected.has(r.student_id));
      await Promise.all(
        targets.map((r) =>
          api.post('/api/v1/notifications/send-sms/', {
            phone: r.phone,
            message: smsMsg,
          }).catch(() => null),
        ),
      );
      toast.success(`${targets.length} ta o'quvchiga SMS yuborildi`);
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

  const columns: ColumnDef<AttendanceSummaryRow>[] = [
    {
      key: 'check',
      header: '',
      className: 'w-10',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.student_id)}
          onChange={() => toggleSelect(row.student_id)}
          onClick={(e) => e.stopPropagation()}
          className="accent-blue-600 w-4 h-4"
        />
      ),
    },
    {
      key: 'name',
      header: "O'quvchi",
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.student_name}</p>
          <p className="text-xs text-gray-400">{formatPhone(row.phone)}</p>
        </div>
      ),
    },
    {
      key: 'group',
      header: 'Guruh',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-700">{row.group}</p>
          <p className="text-xs text-gray-400">{row.course}</p>
        </div>
      ),
    },
    {
      key: 'stats',
      header: 'Darslar',
      render: (row) => (
        <span className="text-gray-600">
          {row.present}/{row.total}
        </span>
      ),
    },
    {
      key: 'absent',
      header: 'Sababsiz',
      render: (row) => (
        <span className="font-semibold text-red-600">{row.absent}</span>
      ),
    },
    {
      key: 'pct',
      header: 'Davomat %',
      render: (row) => <PctBadge pct={row.attendance_pct} />,
    },
  ];

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarCheck className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Davomat</h1>
            <p className="text-xs text-gray-500">Sababsiz qolgan o&apos;quvchilar</p>
          </div>
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

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qidirish..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {!loading && rows.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-blue-600 w-4 h-4"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll}
            />
            Barchasini tanlash
          </label>
        )}
      </div>

      {/* Summary stats */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Jami o\'quvchi', value: rows.length, color: 'text-gray-900' },
            { label: 'O\'rtacha davomat', value: `${Math.round(rows.reduce((s, r) => s + r.attendance_pct, 0) / rows.length)}%`, color: 'text-blue-600' },
            { label: 'Eng ko\'p sababsiz', value: rows[0]?.absent ?? 0, color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={cn('text-2xl font-bold mt-1', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <UserTable
          columns={columns}
          rows={filtered}
          loading={loading}
          skeletonRows={8}
          emptyMessage="Sababsiz qolgan o'quvchilar topilmadi"
          onRowClick={(row) => openCalendar(row)}
          keyExtractor={(row) => row.student_id}
        />
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
                <span className="text-gray-500">
                  {calendar.present}/{calendar.total} dars
                </span>
                <span className="text-red-600 font-medium">{calendar.absent} sababsiz</span>
              </div>
              {/* Legend */}
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
                    setCalendar(null);
                    setSelected(new Set([calendar!.student_id]));
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

      {/* Bulk SMS Modal */}
      <Dialog open={showSms} onOpenChange={setShowSms}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SMS yuborish — {selected.size} ta o&apos;quvchi</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBulkSms} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Xabar <span className="text-red-500">*</span>
              </label>
              <textarea
                value={smsMsg}
                onChange={(e) => setSmsMsg(e.target.value)}
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
