'use client';

import { useEffect, useState, useCallback } from 'react';
import { DoorOpen, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

const DAYS = [
  { key: 'Du', label: 'Du' },
  { key: 'Se', label: 'Se' },
  { key: 'Ch', label: 'Ch' },
  { key: 'Pa', label: 'Pa' },
  { key: 'Ju', label: 'Ju' },
  { key: 'Sh', label: 'Sh' },
  { key: 'Ya', label: 'Ya' },
];

// Map common day abbreviations to canonical keys
const DAY_ALIASES: Record<string, string> = {
  'Du': 'Du', 'Dushanba': 'Du',
  'Se': 'Se', 'Seshanba': 'Se',
  'Ch': 'Ch', 'Cho': 'Ch', 'Chorshanba': 'Ch',
  'Pa': 'Pa', 'Payshanba': 'Pa',
  'Ju': 'Ju', 'Juma': 'Ju',
  'Sh': 'Sh', 'Sha': 'Sh', 'Shanba': 'Sh',
  'Ya': 'Ya', 'Yakshanba': 'Ya',
};

const COURSE_COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'bg-red-100 text-red-800 border-red-200',
];

interface GroupEntry {
  id: string;
  group_name: string;
  course: string | null;
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

export default function RoomsPage() {
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Assign a stable color index per unique course name
  const courseColorMap = new Map<string, number>();
  let colorIdx = 0;
  const getCourseColor = (course: string | null) => {
    if (!course) return 'bg-gray-100 text-gray-600 border-gray-200';
    if (!courseColorMap.has(course)) {
      courseColorMap.set(course, colorIdx % COURSE_COLORS.length);
      colorIdx++;
    }
    return COURSE_COLORS[courseColorMap.get(course)!];
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get('/rooms/');
      setRooms(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Normalize a day string to canonical key
  const normalizeDay = (d: string) => DAY_ALIASES[d.trim()] ?? d.trim();

  // For a given room + day, collect all groups scheduled that day
  const groupsForDay = (room: RoomData, dayKey: string) =>
    room.groups.filter(g => g.days.map(normalizeDay).includes(dayKey));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <DoorOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Xonalar</h1>
            <p className="text-sm text-gray-500">Faol guruhlarning haftalik jadvali</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Yangilash
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-gray-500">
          <p className="mb-3">Ma&apos;lumotlarni yuklashda xatolik</p>
          <button onClick={load} className="text-blue-600 underline text-sm">Qayta urinish</button>
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <DoorOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Faol xonalar topilmadi</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-36 border-r border-gray-200">
                    Xona
                  </th>
                  {DAYS.map(d => (
                    <th key={d.key} className="text-center px-2 py-3 font-semibold text-gray-700 min-w-[110px]">
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room, ri) => (
                  <tr
                    key={room.room}
                    className={cn('border-b border-gray-100', ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}
                  >
                    {/* Room name cell */}
                    <td className="px-4 py-3 font-medium text-gray-800 align-top border-r border-gray-200 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <DoorOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        {room.room}
                      </div>
                    </td>

                    {/* Day cells */}
                    {DAYS.map(d => {
                      const groups = groupsForDay(room, d.key);
                      return (
                        <td key={d.key} className="px-2 py-2 align-top">
                          {groups.length === 0 ? (
                            <div className="h-10 rounded-lg bg-gray-100/60" />
                          ) : (
                            <div className="space-y-1.5">
                              {groups.map(g => (
                                <div
                                  key={g.id}
                                  className={cn(
                                    'rounded-lg border px-2 py-1.5 text-xs leading-snug',
                                    getCourseColor(g.course)
                                  )}
                                >
                                  <div className="font-semibold truncate max-w-[96px]">{g.group_name}</div>
                                  {(g.start_time || g.end_time) && (
                                    <div className="opacity-70 mt-0.5">
                                      {g.start_time ?? ''}{g.start_time && g.end_time ? '–' : ''}{g.end_time ?? ''}
                                    </div>
                                  )}
                                  <div className="opacity-60 mt-0.5">{g.students_count} o&apos;q</div>
                                </div>
                              ))}
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

      {/* Legend */}
      {!loading && !error && rooms.length > 0 && (() => {
        const allCourses = Array.from(
          new Set(rooms.flatMap(r => r.groups.map(g => g.course)).filter(Boolean) as string[])
        );
        return allCourses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allCourses.map(course => (
              <span
                key={course}
                className={cn('px-3 py-1 rounded-full border text-xs font-medium', getCourseColor(course))}
              >
                {course}
              </span>
            ))}
          </div>
        ) : null;
      })()}
    </div>
  );
}
