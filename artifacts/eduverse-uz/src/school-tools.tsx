import { useEffect, useMemo, useState } from 'react';
import { customFetch } from '@workspace/api-client-react';
import { Bell, ClipboardList, Download, FileSpreadsheet, Printer, Send, Sparkles, Upload } from 'lucide-react';
import type { Language } from './school-data';
import { friendlyError } from './errors';

const t = (language: Language, uz: string, ru: string, en: string) =>
  language === 'Uzbek' ? uz : language === 'Русский' ? ru : en;

/* -------------------------------------------------------------------------- */
/* 1. Import a school from Excel (copy-paste of the table)                     */
/* -------------------------------------------------------------------------- */

type Role = 'student' | 'teacher' | 'parent';
type Row = { role: Role; name: string; className?: string; childName?: string; phone?: string };
type Credential = { role: Role; name: string; className: string; login: string; password: string; phone?: string };

function roleOf(value: string): Role | null {
  const v = value.trim().toLowerCase();
  if (/^(student|ученик|ученица|o['‘’`]?quvchi|oquvchi|talaba)/.test(v)) return 'student';
  if (/^(teacher|учитель|учительница|преподаватель|o['‘’`]?qituvchi|oqituvchi|ustoz)/.test(v)) return 'teacher';
  if (/^(parent|родитель|мама|папа|ота|она|ota-ona|ota ona)/.test(v)) return 'parent';
  return null;
}

/** Rows copied from Excel/Google Sheets are tab separated; CSV also works. */
const PHONE = /^\+?[\d\s()\-]{9,18}$/;
const isPhone = (value: string) => PHONE.test(value.trim()) && value.replace(/\D/g, '').length >= 9;
const isClass = (value: string) => /^\d{1,2}\s*[-–]?\s*[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]?$/.test(value.trim());

/**
 * Two formats are accepted (copied from Excel / Google Sheets, or CSV):
 *  1) the simplest one — one row per student:
 *       ФИО ученика · Класс · Телефон родителя · ФИО родителя (optional)
 *     the parent account is created and linked automatically;
 *  2) with a role in the first column: ученик / учитель / родитель.
 * Header rows are skipped.
 */
export function parseTable(text: string): { rows: Row[]; errors: number[] } {
  const rows: Row[] = [];
  const errors: number[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const cells = (line.includes('\t') ? line.split('\t') : line.split(/[;,]/)).map((cell) => cell.trim());
    const role = roleOf(cells[0] ?? '');
    const phone = cells.find((cell) => isPhone(cell));
    if (role) {
      const name = cells[1] ?? '';
      if (!name) { errors.push(index + 1); return; }
      const rest = cells.slice(2).filter((cell) => cell && cell !== phone);
      const className = rest.find((cell) => isClass(cell));
      const childName = role === 'parent' ? rest.find((cell) => cell !== className) : undefined;
      rows.push({ role, name, className, childName, phone });
      return;
    }
    // format 1: student row
    const name = cells[0] ?? '';
    const className = cells.slice(1).find((cell) => isClass(cell));
    if (!name || !className || /^(фио|ф\.и\.о|f\.i\.sh|ism|name|ученик)/i.test(name)) {
      if (index > 0 && name && !/^(фио|ф\.и\.о|ism|name)/i.test(name)) errors.push(index + 1);
      return;
    }
    rows.push({ role: 'student', name, className });
    if (phone) {
      const parentName = cells.slice(1).find((cell) => cell && cell !== className && cell !== phone && !isPhone(cell)) || `${name} — ota-ona / родитель`;
      rows.push({ role: 'parent', name: parentName, childName: name, phone });
    }
  });
  return { rows, errors };
}

const SAMPLE = `ФИО ученика\tКласс\tТелефон родителя\tФИО родителя
Азиз Каримов\t7-А\t+998 90 123 45 67\tКарим Каримов
Малика Юсупова\t7-А\t+998 93 765 43 21\tДилноза Юсупова
учитель\tНодира Рахимова\t7-А`;

export function SchoolImport({ schoolId, language }: { schoolId: string; language: Language }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Credential[]>([]);
  const [skipped, setSkipped] = useState<Array<{ name: string; reason: string }>>([]);
  const [error, setError] = useState('');
  const parsed = useMemo(() => parseTable(text), [text]);
  const counts = useMemo(() => ({
    student: parsed.rows.filter((row) => row.role === 'student').length,
    teacher: parsed.rows.filter((row) => row.role === 'teacher').length,
    parent: parsed.rows.filter((row) => row.role === 'parent').length,
  }), [parsed]);

  async function run() {
    setBusy(true);
    setError('');
    setResult([]);
    setSkipped([]);
    const all: Credential[] = [];
    const missed: Array<{ name: string; reason: string }> = [];
    // Students and teachers go first so that parents find their children.
    const ordered = [...parsed.rows.filter((row) => row.role !== 'parent'), ...parsed.rows.filter((row) => row.role === 'parent')];
    try {
      for (let i = 0; i < ordered.length; i += 40) {
        const chunk = ordered.slice(i, i + 40);
        const response = await customFetch<{ created: Credential[]; skipped: Array<{ name: string; reason: string }> }>(`/api/schools/${schoolId}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
        });
        all.push(...response.created);
        missed.push(...response.skipped);
        setProgress(Math.round(((i + chunk.length) / ordered.length) * 100));
      }
      setText('');
    } catch (requestError) {
      setError(friendlyError(requestError, language));
    } finally {
      setResult(all);
      setSkipped(missed);
      setBusy(false);
    }
  }

  function downloadCsv() {
    const header = 'role;name;class;login;password;phone';
    const body = result.map((row) => [row.role, row.name, row.className, row.login, row.password, row.phone ?? ''].map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'eduverse-logins.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const roleName = (role: Role) => role === 'student' ? t(language, 'O‘quvchi', 'Ученик', 'Student') : role === 'teacher' ? t(language, 'O‘qituvchi', 'Учитель', 'Teacher') : t(language, 'Ota-ona', 'Родитель', 'Parent');

  return (
    <section className="panel import-panel">
      <div className="section-head">
        <h2><FileSpreadsheet size={16} /> {t(language, 'Excel dan import', 'Импорт из Excel', 'Import from Excel')}</h2>
        <button type="button" className="btn small" onClick={() => setText(SAMPLE)}><ClipboardList size={14} /> {t(language, 'Namuna', 'Пример', 'Sample')}</button>
      </div>
      <p className="muted">{t(language,
        'Eng oddiy: har bir qator — bitta o‘quvchi: F.I.Sh · Sinf · Ota-ona telefoni · Ota-ona F.I.Sh. Ota-ona hisobi ham avtomatik yaratiladi. O‘qituvchi uchun birinchi ustunga «учитель» yozing.',
        'Проще всего: одна строка — один ученик: ФИО · Класс · Телефон родителя · ФИО родителя. Аккаунт родителя создастся и привяжется сам. Для учителя напишите в первом столбце «учитель».',
        'Simplest: one row per student: Full name · Class · Parent phone · Parent name. The parent account is created and linked automatically. For a teacher put “teacher” in the first column.')}</p>
      <textarea className="import-area" value={text} onChange={(event) => setText(event.target.value)} rows={8} placeholder={SAMPLE} spellCheck={false} />
      {parsed.rows.length > 0 && (
        <div className="import-summary">
          <span className="tag">{t(language, 'O‘quvchilar', 'Учеников', 'Students')}: <b>{counts.student}</b></span>
          <span className="tag">{t(language, 'O‘qituvchilar', 'Учителей', 'Teachers')}: <b>{counts.teacher}</b></span>
          <span className="tag">{t(language, 'Ota-onalar', 'Родителей', 'Parents')}: <b>{counts.parent}</b></span>
          {parsed.errors.length > 0 && <span className="tag gold">{t(language, 'Tushunilmagan qatorlar', 'Непонятные строки', 'Unreadable rows')}: {parsed.errors.slice(0, 6).join(', ')}</span>}
        </div>
      )}
      <button type="button" className="btn primary" disabled={busy || parsed.rows.length === 0} onClick={() => void run()}>
        <Upload size={15} /> {busy ? `${progress}%` : t(language, 'Import qilish', 'Импортировать', 'Import')}
      </button>
      {busy && <div className="test-progress"><span style={{ width: `${progress}%` }} /></div>}
      {error && <div className="notice" role="alert">{error}</div>}
      {skipped.length > 0 && (
        <div className="notice">{t(language, 'O‘tkazib yuborildi', 'Пропущено', 'Skipped')}: {skipped.map((row) => `${row.name} (${row.reason === 'child-not-found' ? t(language, 'farzand topilmadi', 'ребёнок не найден', 'child not found') : t(language, 'takror', 'дубль', 'duplicate')})`).join(', ')}</div>
      )}
      {result.length > 0 && (
        <div className="import-result">
          <div className="row">
            <b>{t(language, `Yaratildi: ${result.length}`, `Создано: ${result.length}`, `Created: ${result.length}`)}</b>
            <button type="button" className="btn small" onClick={() => window.print()}><Printer size={14} /> {t(language, 'Kartochkalarni chop etish', 'Распечатать карточки', 'Print cards')}</button>
            <button type="button" className="btn small" onClick={downloadCsv}><Download size={14} /> CSV</button>
          </div>
          <p className="muted">{t(language, 'Parollar faqat hozir ko‘rinadi — chop eting yoki saqlang.', 'Пароли видны только сейчас — распечатайте или сохраните.', 'Passwords are shown only now — print or save them.')}</p>
          <div className="login-cards">
            {result.map((row) => (
              <div className="login-card" key={row.login}>
                <small>EDUVERSE · {roleName(row.role)}{row.className ? ` · ${row.className}` : ''}</small>
                <b>{row.name}</b>
                <span>{t(language, 'Login', 'Логин', 'Login')}: <code>{row.login}</code></span>
                <span>{t(language, 'Parol', 'Пароль', 'Password')}: <code>{row.password}</code></span>
                {row.phone ? <span>{t(language, 'Telefon', 'Телефон', 'Phone')}: {row.phone}</span> : null}
                <small>{window.location.host}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Telegram notifications                                                   */
/* -------------------------------------------------------------------------- */

export function TelegramConnect({ language }: { language: Language }) {
  const [state, setState] = useState<{ available: boolean; connected: boolean } | null>(null);
  const [error, setError] = useState('');
  const load = () => customFetch<{ available: boolean; connected: boolean }>('/api/me/telegram', { method: 'GET' }).then(setState).catch(() => {});
  useEffect(() => { void load(); }, []);

  async function connect() {
    setError('');
    try {
      const response = await customFetch<{ link: string }>('/api/me/telegram/link', { method: 'POST' });
      window.open(response.link, '_blank', 'noopener');
      // The bot confirms within seconds; the status refreshes when the user returns.
      const onFocus = () => { void load(); window.removeEventListener('focus', onFocus); };
      window.addEventListener('focus', onFocus);
    } catch (requestError) {
      setError(friendlyError(requestError, language));
    }
  }
  async function disconnect() {
    await customFetch('/api/me/telegram', { method: 'DELETE' }).catch(() => {});
    void load();
  }

  if (!state) return null;
  return (
    <section className="panel">
      <div className="section-head">
        <h2><Bell size={16} /> {t(language, 'Telegram bildirishnomalari', 'Уведомления в Telegram', 'Telegram notifications')}</h2>
        {state.connected && <span className="tag green">{t(language, 'Ulangan', 'Подключено', 'Connected')}</span>}
      </div>
      <p className="muted">{t(language,
        'Darsga kelmaslik, yangi baho va sinf e’lonlari Telegramga keladi.',
        'Пропуски, новые оценки и объявления класса приходят в Telegram.',
        'Absences, new grades and class announcements arrive in Telegram.')}</p>
      {!state.available ? (
        <p className="muted">{t(language, 'Maktab hali Telegram botni ulamagan.', 'Школа ещё не подключила Telegram-бота.', 'The school has not connected the Telegram bot yet.')}</p>
      ) : state.connected ? (
        <button type="button" className="btn" onClick={() => void disconnect()}>{t(language, 'O‘chirish', 'Отключить', 'Disconnect')}</button>
      ) : (
        <button type="button" className="btn primary" onClick={() => void connect()}><Send size={15} /> {t(language, 'Telegramni ulash', 'Подключить Telegram', 'Connect Telegram')}</button>
      )}
      {error && <div className="notice" role="alert">{error}</div>}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. AI lesson plan                                                           */
/* -------------------------------------------------------------------------- */

type Plan = {
  title: string; goals: string[]; steps: Array<{ minutes: number; title: string; activity: string }>;
  questions: string[]; homework: string; experiment: string; source: 'ai' | 'local';
};
const SUBJECTS = ['Kimyo / Химия', 'Fizika / Физика', 'Biologiya / Биология', 'Matematika / Математика', 'Geografiya / География', 'Tarix / История', 'Ingliz tili / English', 'Ona tili / Родной язык', 'Informatika / Информатика'];

export function LessonPlanner({ language }: { language: Language }) {
  const [subject, setSubject] = useState(SUBJECTS[0]!);
  const [grade, setGrade] = useState(7);
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState(45);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function make() {
    if (!topic.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await customFetch<{ plan: Plan }>('/api/ai/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, grade, topic: topic.trim(), minutes, language }),
      });
      setPlan(response.plan);
    } catch (requestError) {
      setError(friendlyError(requestError, language));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel planner">
      <div className="section-head">
        <h2><Sparkles size={16} /> {t(language, 'AI dars rejasi', 'ИИ-план урока', 'AI lesson plan')}</h2>
        {plan && <button type="button" className="btn small" onClick={() => window.print()}><Printer size={14} /> {t(language, 'Chop etish', 'Печать', 'Print')}</button>}
      </div>
      <p className="muted">{t(language, 'Darslik paragrafini yozing — 30 soniyada reja, savollar va uy vazifasi tayyor.', 'Напишите параграф учебника — за 30 секунд готовы план, вопросы и домашнее задание.', 'Type the textbook paragraph — a plan, questions and homework in 30 seconds.')}</p>
      <div className="planner-form">
        <select className="input" value={subject} onChange={(event) => setSubject(event.target.value)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select>
        <select className="input" value={grade} onChange={(event) => setGrade(Number(event.target.value))}>{Array.from({ length: 11 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g}-{t(language, 'sinf', 'класс', 'grade')}</option>)}</select>
        <select className="input" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>{[40, 45, 80, 90].map((m) => <option key={m} value={m}>{m} {t(language, 'daq', 'мин', 'min')}</option>)}</select>
        <input className="input planner-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t(language, '§12. Kislotalar va ularning xossalari', '§12. Кислоты и их свойства', '§12. Acids and their properties')} onKeyDown={(event) => { if (event.key === 'Enter') void make(); }} />
        <button type="button" className="btn primary" disabled={busy || !topic.trim()} onClick={() => void make()}>
          <Sparkles size={15} /> {busy ? t(language, 'Tayyorlanmoqda…', 'Готовим…', 'Working…') : t(language, 'Reja tuzish', 'Составить план', 'Make plan')}
        </button>
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {plan && (
        <div className="plan-doc">
          <h3>{plan.title}</h3>
          {plan.goals.length > 0 && <><h4>{t(language, 'Maqsadlar', 'Цели', 'Goals')}</h4><ul>{plan.goals.map((goal, i) => <li key={i}>{goal}</li>)}</ul></>}
          <h4>{t(language, 'Dars bosqichlari', 'Ход урока', 'Lesson steps')}</h4>
          <div className="plan-steps">
            {plan.steps.map((step, i) => (
              <div className="plan-step" key={i}>
                <span className="plan-min">{step.minutes}′</span>
                <div><b>{step.title}</b><p>{step.activity}</p></div>
              </div>
            ))}
          </div>
          {plan.experiment && <><h4>{t(language, 'Tajriba / 3D', 'Опыт / 3D', 'Experiment / 3D')}</h4><p>{plan.experiment}</p></>}
          {plan.questions.length > 0 && <><h4>{t(language, 'Savollar', 'Вопросы классу', 'Questions')}</h4><ol>{plan.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></>}
          {plan.homework && <><h4>{t(language, 'Uy vazifasi', 'Домашнее задание', 'Homework')}</h4><p>{plan.homework}</p></>}
          {plan.source === 'local' && <p className="muted">{t(language, 'AI hozir mavjud emas — namuna reja ko‘rsatildi.', 'ИИ сейчас недоступен — показан шаблон.', 'AI unavailable — a template is shown.')}</p>}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Password change (name and login are set by the school)                      */
/* -------------------------------------------------------------------------- */

export function PasswordChange({ language, mustChange = false }: { language: Language; mustChange?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (next !== repeat) { setError(t(language, 'Parollar mos emas.', 'Пароли не совпадают.', 'Passwords do not match.')); return; }
    setBusy(true);
    try {
      await customFetch('/api/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current, next }) });
      setMessage(t(language, 'Parol o‘zgartirildi.', 'Пароль изменён.', 'Password changed.'));
      window.dispatchEvent(new Event('eduverse:password-changed'));
      setCurrent(''); setNext(''); setRepeat('');
    } catch (requestError) {
      setError(friendlyError(requestError, language));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`panel ${mustChange ? 'must-change' : ''}`}>
      <h2>{t(language, 'Parolni o‘zgartirish', 'Сменить пароль', 'Change password')}</h2>
      <p className="muted">{mustChange
        ? t(language, 'Maktab bergan vaqtinchalik parolni o‘zingizning parolingizga almashtiring.', 'Замените временный пароль от школы на свой.', 'Replace the temporary password from the school with your own.')
        : t(language, 'Ism va login maktab tomonidan belgilanadi, parolni o‘zingiz o‘zgartirasiz.', 'Имя и логин задаёт школа, пароль вы меняете сами.', 'The school sets your name and login; you change the password.')}</p>
      <form className="password-form" onSubmit={submit}>
        <input className="input" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder={t(language, 'Hozirgi parol', 'Текущий пароль', 'Current password')} required />
        <input className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(event) => setNext(event.target.value)} placeholder={t(language, 'Yangi parol (8+ belgi)', 'Новый пароль (от 8 символов)', 'New password (8+ chars)')} required />
        <input className="input" type="password" autoComplete="new-password" minLength={8} value={repeat} onChange={(event) => setRepeat(event.target.value)} placeholder={t(language, 'Yangi parolni takrorlang', 'Повторите новый пароль', 'Repeat new password')} required />
        <button type="submit" className="btn primary" disabled={busy}>{t(language, 'Saqlash', 'Сохранить', 'Save')}</button>
      </form>
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice" role="alert">{error}</div>}
    </section>
  );
}

export function useMustChangePassword(userId: string | null = 'self'): boolean {
  const [must, setMust] = useState(false);
  useEffect(() => {
    if (!userId) { setMust(false); return; }
    let active = true;
    void customFetch<{ mustChangePassword: boolean }>('/api/me/security', { method: 'GET' })
      .then((response) => { if (active) setMust(response.mustChangePassword); })
      .catch(() => {});
    const onChanged = () => setMust(false);
    window.addEventListener('eduverse:password-changed', onChanged);
    return () => { active = false; window.removeEventListener('eduverse:password-changed', onChanged); };
  }, [userId]);
  return must;
}
