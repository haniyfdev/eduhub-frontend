export interface User {
  id: string;
  role: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
  user: User;
}

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  second_phone: string | null;
  birth_date: string | null;
  archived_at?: string | null;
  course_name: string | null;
  current_group: string | null;
  current_group_id: string | null;
  status: 'pending' | 'active' | 'trial' | 'archived' | 'ignored';
  company_id: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  course_id: string;
  teacher_id: string;
  status: string;
}

export interface StatCard {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  variant?: 'default' | 'danger';
}

export interface RevenuePoint {
  month: string;
  revenue: number;
}

export interface Debtor {
  id: string;
  student_name: string;
  amount: number;
  due_date: string;
}

export interface TeacherStat {
  id: string;
  name: string;
  groups_count: number;
  students_count: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
