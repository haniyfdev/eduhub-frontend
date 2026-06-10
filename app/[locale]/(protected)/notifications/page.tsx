'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import api from '@/lib/axios';
import { cn, formatPhone } from '@/lib/utils';
import { getUser } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { PaginatedResponse } from '@/types';

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  telegram_chat_id: number | null;
  current_group: string | null;
  current_group_id: string | null;
  group_memberships_data: { course_name: string }[];
}

interface GroupRow {
  id: string;
  name: string;
  students_count: number;
}

type TemplateKey = 'payment_reminder' | 'payment_confirmed' | 'custom_message' | 'group_announcement';
type Lang = 'uz' | 'ru' | 'en';

const TEMPLATES: Record<TemplateKey, Record<Lang, string>> = {
  payment_reminder: {
    uz: "📢 <b>To'lov eslatmasi</b>\n\nHurmatli <b>{full_name}</b>,\n\n<b>{course_name}</b> kursi uchun <b>{amount} so'm</b> to'lov muddati <b>{due_date}</b> gacha.\n\n🏫 {company_name}",
    ru: "📢 <b>Напоминание об оплате</b>\n\nУважаемый(ая) <b>{full_name}</b>,\n\nОплата <b>{amount} сум</b> за курс <b>{course_name}</b> до <b>{due_date}</b>.\n\n🏫 {company_name}",
    en: "📢 <b>Payment Reminder</b>\n\nDear <b>{full_name}</b>,\n\nPayment of <b>{amount} UZS</b> for <b>{course_name}</b> is due by <b>{due_date}</b>.\n\n🏫 {company_name}",
  },
  payment_confirmed: {
    uz: "✅ <b>To'lov tasdiqlandi</b>\n\nHurmatli <b>{full_name}</b>,\n\n<b>{amount} so'm</b> to'lovingiz muvaffaqiyatli qabul qilindi.\n\n🏫 {company_name}",
    ru: "✅ <b>Оплата подтверждена</b>\n\nУважаемый(ая) <b>{full_name}</b>,\n\n<b>{amount} сум</b> успешно получено.\n\n🏫 {company_name}",
    en: "✅ <b>Payment Confirmed</b>\n\nDear <b>{full_name}</b>,\n\n<b>{amount} UZS</b> has been successfully received.\n\n🏫 {company_name}",
  },
  custom_message: {
    uz: '📬 <b>{title}</b>\n\n{body}\n\n🏫 {company_name}',
    ru: '📬 <b>{title}</b>\n\n{body}\n\n🏫 {company_name}',
    en: '📬 <b>{title}</b>\n\n{body}\n\n🏫 {company_name}',
  },
  group_announcement: {
    uz: "📣 <b>{group_name} guruhi uchun xabar</b>\n\n{body}\n\n🏫 {company_name}",
    ru: "📣 <b>Сообщение для группы {group_name}</b>\n\n{body}\n\n🏫 {company_name}",
    en: "📣 <b>Message for {group_name} group</b>\n\n{body}\n\n🏫 {company_name}",
  },
};

const STUDENT_TEMPLATES: TemplateKey[] = ['payment_reminder', 'payment_confirmed', 'custom_message'];
const GROUP_TEMPLATES: TemplateKey[] = ['payment_reminder', 'payment_confirmed', 'custom_message', 'group_announcement'];

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPreview(key: TemplateKey, lang: Lang, vars: Record<string, string>): string {
  const tpl = TEMPLATES[key][lang];
  const filled = tpl.replace(/\{(\w+)\}/g, (_, k: string) => escapeHtml(vars[k] ?? `{${k}}`));
  return filled.replace(/\n/g, '<br/>');
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  let results: T[] = [];
  let page = 1;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const { data } = await api.get<PaginatedResponse<T>>(`${url}${sep}page=${page}`);
    results = results.concat(data.results ?? []);
    if (!data.next) break;
    page += 1;
  }
  return results;
}

const selectClass = 'px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700';
const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700';

function buildVars(companyName: string, opts: { fullName?: string; courseName?: string; groupName?: string; title?: string; body?: string }) {
  return {
    full_name: opts.fullName ?? '—',
    course_name: opts.courseName ?? '—',
    amount: '—',
    due_date: '—',
    company_name: companyName || '—',
    group_name: opts.groupName ?? '—',
    title: opts.title ?? '',
    body: opts.body ?? '',
  };
}

function templateLabel(t: ReturnType<typeof useTranslations<'notifications'>>, key: TemplateKey): string {
  switch (key) {
    case 'payment_reminder':   return t('paymentReminder');
    case 'payment_confirmed':  return t('paymentConfirmed');
    case 'custom_message':     return t('customMessage');
    case 'group_announcement': return t('groupAnnouncement');
  }
}

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tNav = useTranslations('navigation');
  const tc = useTranslations('common');

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Tab 1 — individual student
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [template1, setTemplate1] = useState<TemplateKey>('payment_reminder');
  const [lang1, setLang1] = useState<Lang>('uz');
  const [title1, setTitle1] = useState('');
  const [body1, setBody1] = useState('');

  // Tab 2 — group
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [template2, setTemplate2] = useState<TemplateKey>('payment_reminder');
  const [lang2, setLang2] = useState<Lang>('uz');
  const [title2, setTitle2] = useState('');
  const [body2, setBody2] = useState('');

  // Tab 3 — all students
  const [template3, setTemplate3] = useState<TemplateKey>('payment_reminder');
  const [lang3, setLang3] = useState<Lang>('uz');
  const [title3, setTitle3] = useState('');
  const [body3, setBody3] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [studentRows, groupRows] = await Promise.all([
        fetchAllPages<StudentRow>('/api/v1/students/?status=active&page_size=100'),
        fetchAllPages<GroupRow>('/api/v1/groups/?status=active&page_size=100'),
      ]);
      setStudents(studentRows);
      setGroups(groupRows);
    } catch {
      toast.error(tc('error'));
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role === 'superadmin') return;
    const activeId = localStorage.getItem('active_company_id') || u.company_id;
    if (!activeId) return;
    api.get(`/api/v1/companies/${activeId}/`)
      .then(({ data }) => setCompanyName((data as { name?: string }).name ?? ''))
      .catch(() => {});
  }, []);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) || s.phone.includes(q)
    );
  }, [search, students]);

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  const selectedGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const groupStatsMap = useMemo(() => {
    const map: Record<string, { total: number; linked: number }> = {};
    for (const g of groups) {
      const members = students.filter(s => s.current_group_id === g.id);
      map[g.id] = { total: members.length, linked: members.filter(s => s.telegram_chat_id).length };
    }
    return map;
  }, [groups, students]);

  const totalStudents = students.length;
  const totalLinked = useMemo(() => students.filter(s => s.telegram_chat_id).length, [students]);

  const preview1 = useMemo(() => renderPreview(template1, lang1, buildVars(companyName, {
    fullName: selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : undefined,
    courseName: selectedStudent?.group_memberships_data?.[0]?.course_name,
    title: title1,
    body: body1,
  })), [template1, lang1, selectedStudent, title1, body1, companyName]);

  const preview2 = useMemo(() => renderPreview(template2, lang2, buildVars(companyName, {
    groupName: selectedGroup?.name,
    title: title2,
    body: body2,
  })), [template2, lang2, selectedGroup, title2, body2, companyName]);

  const preview3 = useMemo(() => renderPreview(template3, lang3, buildVars(companyName, {
    title: title3,
    body: body3,
  })), [template3, lang3, title3, body3, companyName]);

  function showResult(sent: number, skipped: number) {
    toast.success(`✅ ${t('sentResult', { sent, skipped })}`);
  }

  async function handleSendStudent() {
    if (!selectedStudent) return;
    setSending(true);
    try {
      let res;
      if (template1 === 'custom_message') {
        res = await api.post('/api/v1/notifications/send-custom/', {
          target: 'student', target_id: selectedStudent.id, title: title1, body: body1, lang: lang1,
        });
      } else {
        res = await api.post('/api/v1/notifications/send-to-student/', {
          student_id: selectedStudent.id, template_key: template1, lang: lang1, variables: {},
        });
      }
      if (res.data.sent) {
        toast.success(`✅ ${t('sentSuccess')}`);
      } else {
        toast.error(t('sentFailed'));
      }
    } catch (err: any) {
      if (err?.response?.data?.error === 'telegram_not_linked') {
        toast.error(t('notLinked'));
      } else {
        toast.error(tc('error'));
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSendGroup() {
    if (!selectedGroup) return;
    setSending(true);
    try {
      let res;
      if (template2 === 'custom_message') {
        res = await api.post('/api/v1/notifications/send-custom/', {
          target: 'group', target_id: selectedGroup.id, title: title2, body: body2, lang: lang2,
        });
      } else if (template2 === 'group_announcement') {
        res = await api.post('/api/v1/notifications/send-to-group/', {
          group_id: selectedGroup.id, template_key: 'group_announcement', lang: lang2,
          variables: { body: body2, group_name: selectedGroup.name },
        });
      } else {
        res = await api.post('/api/v1/notifications/send-to-group/', {
          group_id: selectedGroup.id, template_key: template2, lang: lang2, variables: {},
        });
      }
      showResult(res.data.sent, res.data.skipped);
    } catch {
      toast.error(tc('error'));
    } finally {
      setSending(false);
    }
  }

  async function handleSendAll() {
    setSending(true);
    try {
      let res;
      if (template3 === 'custom_message') {
        res = await api.post('/api/v1/notifications/send-custom/', {
          target: 'all', title: title3, body: body3, lang: lang3,
        });
      } else {
        res = await api.post('/api/v1/notifications/send-to-all/', {
          template_key: template3, lang: lang3, variables: {},
        });
      }
      showResult(res.data.sent, res.data.skipped);
    } catch {
      toast.error(tc('error'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <div>
        <h1 className="text-xl font-bold text-gray-900">{tNav('notifications')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
      </div>

      {loading ? (
        <div className="bg-white rounded border border-gray-200 shadow-sm p-4 space-y-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : (
        <Tabs defaultValue="student">
          <TabsList variant="line" className="border-b border-gray-200 w-full justify-start">
            <TabsTrigger value="student">{t('toStudent')}</TabsTrigger>
            <TabsTrigger value="group">{t('toGroup')}</TabsTrigger>
            <TabsTrigger value="all">{t('toAll')}</TabsTrigger>
          </TabsList>

          {/* Tab 1: individual student */}
          <TabsContent value="student" className="mt-4">
            <div className="bg-white rounded border border-gray-200 shadow-sm p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('selectStudent')}</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className={cn(inputClass, 'mb-2')}
                />
                <div className="border border-gray-200 rounded max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {filteredStudents.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-gray-400">{t('noResults')}</div>
                  ) : filteredStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStudentId(s.id)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors',
                        selectedStudentId === s.id && 'bg-blue-50'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{s.first_name} {s.last_name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {formatPhone(s.phone)}
                          {s.group_memberships_data?.[0]?.course_name ? ` · ${s.group_memberships_data[0].course_name}` : ''}
                        </p>
                      </div>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border flex-shrink-0',
                        s.telegram_chat_id ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                      )}>
                        {s.telegram_chat_id ? `✅ ${t('linked')}` : `❌ ${t('notLinked')}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedStudent && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('template')}</label>
                      <select value={template1} onChange={(e) => setTemplate1(e.target.value as TemplateKey)} className={cn(selectClass, 'w-full')}>
                        {STUDENT_TEMPLATES.map((key) => <option key={key} value={key}>{templateLabel(t, key)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('language')}</label>
                      <select value={lang1} onChange={(e) => setLang1(e.target.value as Lang)} className={cn(selectClass, 'w-full')}>
                        <option value="uz">UZ</option>
                        <option value="ru">RU</option>
                        <option value="en">EN</option>
                      </select>
                    </div>
                  </div>

                  {template1 === 'custom_message' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('title')}</label>
                        <input value={title1} onChange={(e) => setTitle1(e.target.value)} placeholder={t('titlePlaceholder')} className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('body')}</label>
                        <textarea value={body1} onChange={(e) => setBody1(e.target.value)} placeholder={t('bodyPlaceholder')} rows={4} className={inputClass} />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('preview')}</label>
                    <div className="border border-gray-200 rounded p-3 bg-gray-50 text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: preview1 }} />
                  </div>

                  <Button onClick={handleSendStudent} disabled={sending || !selectedStudent.telegram_chat_id} className="gap-2">
                    <Send className="w-4 h-4" />
                    {t('send')}
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          {/* Tab 2: group */}
          <TabsContent value="group" className="mt-4">
            <div className="bg-white rounded border border-gray-200 shadow-sm p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('selectGroup')}</label>
                <select
                  value={selectedGroupId ?? ''}
                  onChange={(e) => setSelectedGroupId(e.target.value || null)}
                  className={cn(selectClass, 'w-full')}
                >
                  <option value="">{t('selectGroup')}</option>
                  {groups.map((g) => {
                    const stats = groupStatsMap[g.id] ?? { total: 0, linked: 0 };
                    return (
                      <option key={g.id} value={g.id}>
                        {`${g.name} — ${t('groupStats', { total: stats.total, linked: stats.linked })}`}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedGroup && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('template')}</label>
                      <select value={template2} onChange={(e) => setTemplate2(e.target.value as TemplateKey)} className={cn(selectClass, 'w-full')}>
                        {GROUP_TEMPLATES.map((key) => <option key={key} value={key}>{templateLabel(t, key)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('language')}</label>
                      <select value={lang2} onChange={(e) => setLang2(e.target.value as Lang)} className={cn(selectClass, 'w-full')}>
                        <option value="uz">UZ</option>
                        <option value="ru">RU</option>
                        <option value="en">EN</option>
                      </select>
                    </div>
                  </div>

                  {template2 === 'custom_message' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('title')}</label>
                        <input value={title2} onChange={(e) => setTitle2(e.target.value)} placeholder={t('titlePlaceholder')} className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('body')}</label>
                        <textarea value={body2} onChange={(e) => setBody2(e.target.value)} placeholder={t('bodyPlaceholder')} rows={4} className={inputClass} />
                      </div>
                    </div>
                  )}

                  {template2 === 'group_announcement' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('body')}</label>
                      <textarea value={body2} onChange={(e) => setBody2(e.target.value)} placeholder={t('bodyPlaceholder')} rows={4} className={inputClass} />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('preview')}</label>
                    <div className="border border-gray-200 rounded p-3 bg-gray-50 text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: preview2 }} />
                  </div>

                  <Button onClick={handleSendGroup} disabled={sending} className="gap-2">
                    <Send className="w-4 h-4" />
                    {t('send')}
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          {/* Tab 3: all students */}
          <TabsContent value="all" className="mt-4">
            <div className="bg-white rounded border border-gray-200 shadow-sm p-4 space-y-4">
              <p className="text-sm font-medium text-gray-700">
                {t('totalStats', { total: totalStudents, linked: totalLinked })}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('template')}</label>
                  <select value={template3} onChange={(e) => setTemplate3(e.target.value as TemplateKey)} className={cn(selectClass, 'w-full')}>
                    {STUDENT_TEMPLATES.map((key) => <option key={key} value={key}>{templateLabel(t, key)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('language')}</label>
                  <select value={lang3} onChange={(e) => setLang3(e.target.value as Lang)} className={cn(selectClass, 'w-full')}>
                    <option value="uz">UZ</option>
                    <option value="ru">RU</option>
                    <option value="en">EN</option>
                  </select>
                </div>
              </div>

              {template3 === 'custom_message' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('title')}</label>
                    <input value={title3} onChange={(e) => setTitle3(e.target.value)} placeholder={t('titlePlaceholder')} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('body')}</label>
                    <textarea value={body3} onChange={(e) => setBody3(e.target.value)} placeholder={t('bodyPlaceholder')} rows={4} className={inputClass} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('preview')}</label>
                <div className="border border-gray-200 rounded p-3 bg-gray-50 text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: preview3 }} />
              </div>

              <Button onClick={() => setConfirmOpen(true)} disabled={sending || totalStudents === 0} className="gap-2">
                <Send className="w-4 h-4" />
                {t('sendToAll')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sendToAll')}</DialogTitle>
            <DialogDescription>{t('confirmSend', { count: totalStudents })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={() => { setConfirmOpen(false); handleSendAll(); }}>{t('send')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
