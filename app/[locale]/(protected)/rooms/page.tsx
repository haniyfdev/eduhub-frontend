'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { DoorOpen, RefreshCw, Calendar, List, Snowflake } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { key: 'Du', label: 'Dushanba' },
  { key: 'Se', label: 'Seshanba' },
  { key: 'Ch', label: 'Chorshanba' },
  { key: 'Pa', label: 'Payshanba' },
  { key: 'Ju', label: 'Juma' },
  { key: 'Sh', label: 'Shanba' },
  { key: 'Ya', label: 'Yakshanba' },
];

const DAY_ALIASES: Record<string, string> = {
  Du: 'Du', Dushanba: 'Du',
  Se: 'Se', Seshanba: 'Se',
  Ch: 'Ch', Cho: 'Ch', Chorshanba: 'Ch',
  Pa: 'Pa', Payshanba: 'Pa',
  Ju: 'Ju', Juma: 'Ju',
  Sh: 'Sh', Sha: 'Sh', Shanba: 'Sh',
  Ya: 'Ya', Yakshanba: 'Ya',
};

const PALETTE = [
  { bg: 'bg-indigo-100',  text: 'text-indigo-800',  border: 'border-indigo-200',  dot: '#6366f1' },
  { bg: 'bg-violet-100',  text: 'text-violet-800',  border: 'border-violet-200',  dot: '#8b5cf6' },
  { bg: 'bg-pink-100',    text: 'text-pink-800',    border: 'border-pink-200',    dot: '#ec4899' },
  { bg: 'bg-blue-100',    text: 'text-blue-800',    border: 'border-blue-200',    dot: '#3b82f6' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: '#10b981' },
  { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-200',   dot: '#f59e0b' },
  { bg: 'bg-red-100',     text: 'text-red-800',     border: 'border-red-200',     dot: '#ef4444' },
  { bg: 'bg-cyan-100',    text: 'text-cyan-800',    border: 'border-cyan-200',    dot: '#06b6d4' },
  { bg: 'bg-lime-100',    text: 'text-lime-800',    border: 'border-lime-200',    dot: '#84cc16' },
  { bg: 'bg-orange-100',  text: 'text-orange-800',  border: 'border-orange-200',  dot: '#f97316' },
];

function hashIdx(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h) % PALETTE.length;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupEntry {
  id: string;
  name: string;
  course: string;
  course_id: string | null;
  teacher: string;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  status: string;
  students_count: number;
}

interface RoomData {
  room: string;
  groups: GroupEntry[];
}

type ViewMode = 'weekly' | 'list';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoomsPage() {
  const [rooms,   setRooms]   = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [view,    setView]    = useState<ViewMode>('weekly');

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get('/api/v1/rooms/');
      setRooms(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const normalizeDay = (d: string) => DAY_ALIASES[d.trim()] ?? d.trim();

  const groupsForDay = (room: RoomData, dayKey: string) =>
    room.groups.filter(g => g.days.map(normalizeDay).includes(dayKey));

  // Stable color per course (by course name hash)
  const courseColor = (course: string | null) => PALETTE[hashIdx(course || '')];

  // All unique courses for legend
  const allCourses = useMemo(() =>
    Array.from(new Set(rooms.flatMap(r => r.groups.map(g => g.course)).filter(Boolean))),
  [rooms]);

  // Flat list of all groups for list view
  const allGroups = useMemo(() =>
    rooms.flatMap(r => r.groups.map(g => ({ ...g, room: r.room }))),
  [rooms]);

  // ── Skeleton helpers ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
    </div>
  );

  if (error) return (
    <div className="p-6 text-center py-24 text-gray-500">
      <DoorOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="mb-3">Ma&apos;lumotlarni yuklashda xatolik</p>
      <button onClick={load} className="text-blue-600 underline text-sm">Qayta urinish</button>
    </div>
  );

  if (rooms.length === 0) return (
    <div className="p-6 text-center py-24 text-gray-400">
      <DoorOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">Faol guruhlar topilmadi</p>
      <p className="text-sm mt-1">Hozircha birorta xona mavjud emas</p>
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <DoorOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Xonalar jadvali</h1>
            <p className="text-sm text-gray-500">Faol guruhlarning haftalik ko&apos;rinishi</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('weekly')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                view === 'weekly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              <Calendar className="w-3.5 h-3.5" /> Haftalik
            </button>
            <button
              onClick={() => setView('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200',
                view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              <List className="w-3.5 h-3.5" /> Ro&apos;yxat
            </button>
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Yangilash
          </button>
        </div>
      </div>

      {/* ── Weekly Grid ── */}
      {view === 'weekly' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-36 border-r border-gray-200 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
                    Xona
                  </th>
                  {DAYS.map(d => (
                    <th key={d.key} className="text-center px-2 py-3 font-semibold text-gray-600 text-xs min-w-[120px]">
                      <span className="font-bold text-gray-700">{d.key}</span>
                      <br />
                      <span className="text-gray-400 font-normal text-[10px]">{d.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room, ri) => (
                  <tr key={room.room}
                    className={cn('border-b border-gray-100', ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30')}>
                    {/* Room name — sticky */}
                    <td className="px-4 py-3 font-semibold text-gray-800 align-top border-r border-gray-200 whitespace-nowrap sticky left-0 bg-inherit z-10">
                      <div className="flex items-center gap-2">
                        <DoorOpen className="w-4 h-4 text-blue-400 shrink-0" />
                        {room.room}
                      </div>
                    </td>
                    {/* Day cells */}
                    {DAYS.map(d => {
                      const groups = groupsForDay(room, d.key);
                      return (
                        <td key={d.key} className="px-1.5 py-1.5 align-top">
                          {groups.length === 0 ? (
                            <div className="h-12 rounded-lg bg-gray-100/50" />
                          ) : (
                            <div className="space-y-1">
                              {groups.map(g => {
                                const col = courseColor(g.course);
                                const frozen = g.status === 'frozen';
                                return (
                                  <div key={g.id}
                                    className={cn(
                                      'rounded-lg border px-2 py-1.5 text-xs leading-snug cursor-default',
                                      frozen
                                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                                        : `${col.bg} ${col.text} ${col.border}`
                                    )}
                                    title={`${g.name} — ${g.teacher} — ${g.course}`}
                                  >
                                    <div className="font-bold flex items-center gap-1">
                                      {g.name}
                                      {frozen && <Snowflake className="w-2.5 h-2.5 text-blue-400 shrink-0" />}
                                    </div>
                                    {g.start_time && (
                                      <div className="opacity-70 text-[10px] mt-0.5">
                                        {g.start_time}{g.end_time ? `–${g.end_time}` : ''}
                                      </div>
                                    )}
                                    <div className="opacity-55 text-[10px] truncate max-w-[100px]">{g.course}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── List View ── */}
      {view === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', 'Xona', 'Guruh', 'Kurs', "O'qituvchi", 'Kunlar', 'Soatlar', "O'quvchilar", 'Holat'].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allGroups.map((g, idx) => {
                  const col = courseColor(g.course);
                  return (
                    <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-700">
                        <div className="flex items-center gap-1.5">
                          <DoorOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          {(g as GroupEntry & { room: string }).room}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold border', col.bg, col.text, col.border)}>
                          {g.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-medium">{g.course}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{g.teacher}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{g.days.join(', ')}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {g.start_time && g.end_time ? `${g.start_time}–${g.end_time}` : g.start_time ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                          {g.students_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {g.status === 'frozen'
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                              <Snowflake className="w-3 h-3" /> Muzlatilgan
                            </span>
                          : <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                              Faol
                            </span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Course Legend ── */}
      {allCourses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allCourses.map(course => {
            const col = courseColor(course);
            return (
              <span key={course}
                className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium', col.bg, col.text, col.border)}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.dot }} />
                {course}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
