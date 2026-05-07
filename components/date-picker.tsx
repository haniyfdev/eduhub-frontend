'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string; // ISO yyyy-mm-dd or ''
  onChange: (iso: string) => void;
  placeholder?: string;
  minYear?: number;
  maxYear?: number;
  className?: string;
}

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'KK/OO/YYYY',
  minYear = 1900,
  maxYear,
  className,
}: DatePickerProps) {
  const currentYear = new Date().getFullYear();
  const effectiveMaxYear = maxYear ?? currentYear - 5;

  const parsedDate = value ? (() => {
    const [y, m, d] = value.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
  })() : null;

  const [view, setView] = useState({
    year: parsedDate?.year ?? effectiveMaxYear,
    month: parsedDate?.month ?? 0,
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const display = value
    ? value.split('-').reverse().join('/')
    : '';

  function prevMonth() {
    setView((v) => v.month === 0
      ? { year: v.year - 1, month: 11 }
      : { ...v, month: v.month - 1 });
  }
  function nextMonth() {
    setView((v) => v.month === 11
      ? { year: v.year + 1, month: 0 }
      : { ...v, month: v.month + 1 });
  }

  function selectDay(day: number) {
    const y = String(view.year);
    const m = String(view.month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  }

  const daysInMonth = getDaysInMonth(view.year, view.month);
  const firstDay = getFirstDayOfMonth(view.year, view.month);
  const years = Array.from({ length: effectiveMaxYear - minYear + 1 }, (_, i) => effectiveMaxYear - i);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center w-full px-3 py-2 border rounded text-sm text-left transition-colors',
          open ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400',
          display ? 'text-gray-900' : 'text-gray-400'
        )}
      >
        <CalendarIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
        {display || placeholder}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-72">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className="flex items-center gap-1">
              <select
                value={view.month}
                onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
                className="text-xs font-semibold text-gray-700 border-0 focus:outline-none cursor-pointer pr-1"
              >
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select
                value={view.year}
                onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
                className="text-xs font-semibold text-gray-700 border-0 focus:outline-none cursor-pointer"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-gray-100">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const isSelected = parsedDate &&
                parsedDate.year === view.year &&
                parsedDate.month === view.month &&
                parsedDate.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={cn(
                    'text-center text-xs py-1.5 rounded transition-colors',
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {value && (
            <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">{display}</span>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="text-xs text-red-500 hover:underline"
              >
                Tozalash
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
