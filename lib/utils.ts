import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('uz-UZ').format(amount) + ' so\'m';
}

export function formatPhone(phone: string): string {
  return phone.replace(/(\+998)(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
}

export function parseDMY(str: string): string | null {
  const match = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear() - 3) return null;
  return `${year}-${month}-${day}`;
}

export function formatDMY(iso: string | null | undefined): string {
  if (!iso) return '—';
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
