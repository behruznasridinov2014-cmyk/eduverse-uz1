import { useEffect, useMemo, useState } from 'react';
import type { LessonTopic, User } from '@workspace/api-client-react';
import { BookOpen, Box, CheckCircle2, ChevronRight, Lightbulb, Lock, MonitorPlay, NotebookPen, Sparkles, Target } from 'lucide-react';
import type { Language, SchoolData } from './school-data';
import { COURSE, SUBJECT_LABEL, type CourseBook, type CourseScene, type CourseTopic } from './course-data';
import { MoleculeById, ReactionView } from './chem-lab';
import { Circuit, Pendulum } from './physics-lab';
import { CollisionLab } from './collision-lab';
import { MathLab } from './studio-labs';
import { TopicModels } from './topic-library';

const t = (language: Language, uz: string, ru: string, en: string) =>
  language === 'Uzbek' ? uz : language === 'Русский' ? ru : en;

/** The 3D part of a textbook topic. Every scene can be operated by the student. */
export function CourseScene3D({ scene, language }: { scene: CourseScene; language: Language }) {
  switch (scene.kind) {
    case 'molecule': return <MoleculeById id={scene.id} language={language} />;
    case 'reaction': return <ReactionView a={scene.a} b={scene.b} language={language} />;
    case 'pendulum': return <Pendulum language={language} />;
    case 'circuit': return <Circuit language={language} />;
    case 'collision': return <CollisionLab language={language} />;
    case 'solid': return <MathLab language={language} initial={scene.solid} />;
    case 'web': {
      const topic = { id: `course-${scene.query}`, subject: '', title: scene.query, visual3d: { kind: scene.query, parts: [] } } as unknown as LessonTopic;
      return <TopicModels key={scene.query} topic={topic} language={language} />;
    }
  }
}

const studiedKey = (userId: string) => `eduverse:studied:${userId}`;

export function CoursePage({ user, school, language, onOpen }: { user: User; school: SchoolData; language: Language; onOpen: (path: string) => void }) {
  const isStudent = user.role === 'student';
  const grades = useMemo(() => [...new Set(COURSE.map((book) => book.grade))].sort((a, b) => a - b), []);
  const studentGrade = school.classes[0]?.grade ?? null;
  const [grade, setGrade] = useState<number>(isStudent ? studentGrade ?? 0 : grades[0] ?? 7);
  useEffect(() => {
    if (isStudent && studentGrade) setGrade(studentGrade);
  }, [isStudent, studentGrade]);

  // A student only studies the books of their own grade — not the next years.
  const books = COURSE.filter((book) => book.grade === grade);
  const [bookId, setBookId] = useState<string>(books[0]?.id ?? '');
  const book: CourseBook | undefined = books.find((item) => item.id === bookId) ?? books[0];
  const [topicKey, setTopicKey] = useState<string>(book?.topics[0]?.key ?? '');
  const topic: CourseTopic | undefined = book?.topics.find((item) => item.key === topicKey) ?? book?.topics[0];
  const [openAnswers, setOpenAnswers] = useState<Record<number, boolean>>({});
  const [studied, setStudied] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(studiedKey(user.id)) ?? '[]') as string[]; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(studiedKey(user.id), JSON.stringify(studied)); } catch { /* private mode */ }
  }, [studied, user.id]);
  useEffect(() => { setOpenAnswers({}); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }, [topicKey]);
  useEffect(() => { if (book && !book.topics.some((item) => item.key === topicKey)) setTopicKey(book.topics[0]?.key ?? ''); }, [book, topicKey]);

  if (isStudent && school.status === 'ready' && !studentGrade) {
    return <Empty language={language} text={t(language, 'Sizni hali sinfga qo‘shishmagan. O‘qituvchidan so‘rang.', 'Вас ещё не добавили в класс. Попросите учителя.', 'You are not in a class yet. Ask your teacher.')} />;
  }
  if (!book || !topic) {
    return <Empty language={language} text={t(language, `${grade}-sinf darsliklari hali yuklanmagan.`, `Учебники для ${grade} класса ещё не загружены.`, `Textbooks for grade ${grade} are not uploaded yet.`)} />;
  }

  const chapters = [...new Set(book.topics.map((item) => item.chapter))];
  const done = book.topics.filter((item) => studied.includes(item.key)).length;
  const pdfPage = topic.page + book.pdfOffset;
  const isStudied = studied.includes(topic.key);
  const subjectName = (subject: CourseBook['subject']) => t(language, ...SUBJECT_LABEL[subject]);

  return (
    <section className="course">
      <div className="course-head">
        <div>
          <div className="eyebrow">{t(language, 'Darslik bo‘yicha', 'По учебнику', 'By the textbook')} · {t(language, `${grade}-sinf`, `${grade} класс`, `Grade ${grade}`)}</div>
          <h1>{t(language, 'Dars mavzulari', 'Темы уроков', 'Lesson topics')}</h1>
          <p className="page-subtitle">{t(language,
            'Har bir mavzu: mohiyati, faktlar, o‘zingiz boshqaradigan 3D, topshiriqlar va uy vazifasi.',
            'Каждая тема: суть простыми словами, факты, 3D, которым управляете сами, задания и домашка.',
            'Every topic: the essence, facts, a 3D you control, tasks and homework.')}</p>
        </div>
        {!isStudent && grades.length > 1 && (
          <select className="input" value={grade} onChange={(event) => setGrade(Number(event.target.value))} style={{ maxWidth: 160 }}>
            {grades.map((g) => <option key={g} value={g}>{t(language, `${g}-sinf`, `${g} класс`, `Grade ${g}`)}</option>)}
          </select>
        )}
      </div>

      <div className="course-subjects">
        {books.map((item) => (
          <button type="button" key={item.id} className={`studio-tab ${item.id === book.id ? 'active' : ''}`} onClick={() => { setBookId(item.id); setTopicKey(item.topics[0]?.key ?? ''); }}>
            <span>●</span>{subjectName(item.subject)}
          </button>
        ))}
      </div>

      <div className="course-layout">
        <aside className="panel course-nav">
          <div className="course-progress">
            <b>{done} / {book.topics.length}</b>
            <span>{t(language, 'mavzu o‘rganildi', 'тем изучено', 'topics studied')}</span>
            <div className="test-progress"><span style={{ width: `${(done / book.topics.length) * 100}%` }} /></div>
          </div>
          {chapters.map((chapter) => (
            <div key={chapter} className="course-chapter">
              <small>{chapter}</small>
              {book.topics.filter((item) => item.chapter === chapter).map((item) => (
                <button type="button" key={item.key} className={`course-topic ${item.key === topic.key ? 'active' : ''}`} onClick={() => setTopicKey(item.key)}>
                  <span className="course-code">§{item.code}</span>
                  <span className="course-name">{item.title}</span>
                  {studied.includes(item.key) ? <CheckCircle2 size={15} className="course-done" /> : <ChevronRight size={15} />}
                </button>
              ))}
            </div>
          ))}
          {isStudent && (
            <p className="muted course-lock"><Lock size={13} /> {t(language, 'Faqat o‘z sinfingiz darsliklari ochiq.', 'Открыты только учебники вашего класса.', 'Only your grade’s textbooks are open.')}</p>
          )}
        </aside>

        <article className="course-topic-view" key={topic.key}>
          <header className="course-hero">
            <div>
              <div className="eyebrow">§{topic.code} · {topic.chapter}</div>
              <h2>{topic.title}</h2>
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => { try { localStorage.setItem(`eduverse:pdf-page:/books/${book.bookId}.pdf`, String(pdfPage)); } catch { /* private mode */ } onOpen(`/read/${book.bookId}`); }}><BookOpen size={15} /> {t(language, `Darslikda ochish · ${topic.page}-bet`, `Открыть в учебнике · стр. ${topic.page}`, `Open in textbook · p. ${topic.page}`)}</button>
              {!isStudent && <button type="button" className="btn primary" onClick={() => onOpen(`/lesson/course:${topic.key}`)}><MonitorPlay size={15} /> {t(language, 'Shu mavzuda dars', 'Урок по этой теме', 'Lesson on this topic')}</button>}
            </div>
          </header>

          <section className="panel course-essence">
            <h3><Lightbulb size={17} /> {t(language, 'Mohiyati', 'Суть темы', 'The essence')}</h3>
            <p>{topic.essence}</p>
            <div className="course-life"><Target size={15} /> <span><b>{t(language, 'Hayotda:', 'В жизни:', 'In life:')}</b> {topic.life}</span></div>
          </section>

          <section className="course-3d">
            <div className="course-3d-head">
              <h3><Box size={17} /> {t(language, '3D da o‘rganing', 'Изучите в 3D', 'Explore in 3D')}</h3>
              <p className="muted">{topic.sceneHint}</p>
            </div>
            <CourseScene3D scene={topic.scene} language={language} />
          </section>

          <section className="course-facts">
            {topic.facts.map((fact, index) => (
              <div className="course-fact" key={index}><Sparkles size={15} /><span>{fact}</span></div>
            ))}
          </section>

          <section className="panel">
            <h3><NotebookPen size={17} /> {t(language, 'Topshiriqlar', 'Задания', 'Tasks')}</h3>
            <ol className="course-tasks">
              {topic.tasks.map((task, index) => (
                <li key={index}>
                  <p>{task.q}</p>
                  {openAnswers[index]
                    ? <div className="course-answer">{task.a}</div>
                    : <button type="button" className="btn small" onClick={() => setOpenAnswers((current) => ({ ...current, [index]: true }))}>{t(language, 'Javobni tekshirish', 'Проверить ответ', 'Check the answer')}</button>}
                </li>
              ))}
            </ol>
          </section>

          <section className="panel course-homework">
            <h3>{t(language, 'Uy vazifasi', 'Домашнее задание', 'Homework')}</h3>
            <p>{topic.homework}</p>
            {isStudent && <button type="button" className="btn" onClick={() => onOpen('/classes')}><NotebookPen size={15} /> {t(language, 'Daftar rasmini yuborish', 'Отправить фото тетради', 'Send a notebook photo')}</button>}
          </section>

          <div className="course-footer">
            <button type="button" className={`btn ${isStudied ? '' : 'primary'}`} onClick={() => setStudied((current) => current.includes(topic.key) ? current.filter((key) => key !== topic.key) : [...current, topic.key])}>
              <CheckCircle2 size={15} /> {isStudied ? t(language, 'O‘rganildi ✓', 'Изучено ✓', 'Studied ✓') : t(language, 'Mavzuni o‘rgandim', 'Я изучил тему', 'I studied this topic')}
            </button>
            {(() => {
              const index = book.topics.findIndex((item) => item.key === topic.key);
              const next = book.topics[index + 1];
              return next ? <button type="button" className="btn" onClick={() => setTopicKey(next.key)}>{t(language, 'Keyingi mavzu', 'Следующая тема', 'Next topic')}: §{next.code} <ChevronRight size={15} /></button> : null;
            })()}
          </div>
        </article>
      </div>
    </section>
  );
}

function Empty({ text }: { language: Language; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><BookOpen /></span>
      <h2>{text}</h2>
    </div>
  );
}
