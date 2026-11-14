import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { Language } from './school-data';

const t = (language: Language, uz: string, ru: string, en: string) =>
  language === 'Uzbek' ? uz : language === 'Русский' ? ru : en;

/**
 * Car crash in slow motion (momentum and energy).
 *
 * Two cars drive towards each other (or one catches up with the other). The
 * collision follows the real 1D formulas with a coefficient of restitution e:
 *   v1' = (m1·v1 + m2·v2 + m2·e·(v2 − v1)) / (m1 + m2)
 *   v2' = (m1·v1 + m2·v2 + m1·e·(v1 − v2)) / (m1 + m2)
 * Momentum is always conserved; the "lost" kinetic energy goes into crumpling
 * the bodies and heat — the cars visibly crumple by that amount.
 */
type Car = { x: number; v: number; m: number; len: number; crumple: number; color: string };
const ROAD = 60; // metres shown
const G = 9.81;

export function CollisionLab({ language, compact = false }: { language: Language; compact?: boolean }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [m1, setM1] = useState(1200);
  const [m2, setM2] = useState(1500);
  const [v1, setV1] = useState(15);
  const [v2, setV2] = useState(-10);
  const [e, setE] = useState(0.2);
  const [mu, setMu] = useState(0.6);
  const [slow, setSlow] = useState(0.25);
  const [running, setRunning] = useState(true);
  const [result, setResult] = useState<null | { p0: number; p1: number; k0: number; k1: number; u1: number; u2: number }>(null);
  const sim = useRef({ cars: [] as Car[], collided: false, time: 0, sparks: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number }> });

  const reset = () => {
    sim.current = {
      cars: [
        { x: 8, v: v1, m: m1, len: 4.4, crumple: 0, color: '#4BA3DB' },
        { x: ROAD - 12, v: v2, m: m2, len: 4.8, crumple: 0, color: '#D2B26E' },
      ],
      collided: false,
      time: 0,
      sparks: [],
    };
    setResult(null);
  };
  useEffect(reset, [m1, m2, v1, v2, e, mu]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const real = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      const dt = running ? real * slow : 0;
      const [a, b] = s.cars;
      if (a && b && dt > 0) {
        for (const car of [a, b]) {
          car.x += car.v * dt;
          // friction only after the crash (the drivers brake / wheels block)
          if (s.collided && car.v !== 0) {
            const dv = mu * G * dt;
            car.v = Math.abs(car.v) <= dv ? 0 : car.v - Math.sign(car.v) * dv;
          }
        }
        s.time += dt;
        if (!s.collided && a.x + a.len >= b.x) {
          s.collided = true;
          const p0 = a.m * a.v + b.m * b.v;
          const k0 = 0.5 * a.m * a.v ** 2 + 0.5 * b.m * b.v ** 2;
          const u1 = (a.m * a.v + b.m * b.v + b.m * e * (b.v - a.v)) / (a.m + b.m);
          const u2 = (a.m * a.v + b.m * b.v + a.m * e * (a.v - b.v)) / (a.m + b.m);
          const k1 = 0.5 * a.m * u1 ** 2 + 0.5 * b.m * u2 ** 2;
          const lost = Math.max(0, k0 - k1);
          // crumple depth grows with the absorbed energy (illustrative scale)
          const depth = Math.min(1.4, Math.sqrt(lost) / 260);
          a.crumple = depth * (b.m / (a.m + b.m));
          b.crumple = depth * (a.m / (a.m + b.m));
          a.v = u1;
          b.v = u2;
          b.x = a.x + a.len;
          setResult({ p0, p1: a.m * u1 + b.m * u2, k0, k1, u1, u2 });
          const cx = a.x + a.len;
          for (let i = 0; i < 40; i += 1) {
            s.sparks.push({ x: cx, y: 1.1, vx: (Math.random() - 0.5) * 14, vy: Math.random() * 8 + 2, life: 1 });
          }
        }
        for (const spark of s.sparks) {
          spark.x += spark.vx * dt;
          spark.y += spark.vy * dt;
          spark.vy -= G * dt;
          spark.life -= dt * 1.4;
        }
        s.sparks = s.sparks.filter((spark) => spark.life > 0 && spark.y > 0);
      }

      // ---- draw: road with perspective, cars as 3D boxes ----
      const ratio = window.devicePixelRatio || 1;
      const w = element.clientWidth, h = element.clientHeight;
      if (element.width !== w * ratio) { element.width = w * ratio; element.height = h * ratio; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const sky = context.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#CFE8F8');
      sky.addColorStop(0.55, '#F4EEE2');
      sky.addColorStop(1, '#E9DFCB');
      context.fillStyle = sky;
      context.fillRect(0, 0, w, h);
      const groundY = h * 0.72;
      const px = w / ROAD;
      // road
      context.fillStyle = '#5E6470';
      context.beginPath();
      context.moveTo(0, groundY);
      context.lineTo(w, groundY);
      context.lineTo(w, groundY + 46);
      context.lineTo(0, groundY + 46);
      context.closePath();
      context.fill();
      context.fillStyle = '#7A808C';
      context.beginPath();
      context.moveTo(0, groundY - 26);
      context.lineTo(w, groundY - 26);
      context.lineTo(w, groundY);
      context.lineTo(0, groundY);
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,.85)';
      context.setLineDash([18, 16]);
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, groundY + 22);
      context.lineTo(w, groundY + 22);
      context.stroke();
      context.setLineDash([]);
      // distance marks
      context.fillStyle = 'rgba(30,38,51,.55)';
      context.font = '600 10px DM Sans, sans-serif';
      for (let m = 0; m <= ROAD; m += 10) context.fillText(`${m} m`, m * px + 2, groundY + 60);

      const drawCar = (car: Car, facing: 1 | -1) => {
        const len = Math.max(1.6, car.len - car.crumple) * px;
        const x = car.x * px + (facing === -1 ? car.crumple * px : 0);
        const bodyH = 26, depth = 16, roofH = 18;
        const y = groundY - 8 - bodyH;
        const shade = (hex: string, k: number) => {
          const n = parseInt(hex.slice(1), 16);
          const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
          return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
        };
        // shadow
        context.fillStyle = 'rgba(0,0,0,.18)';
        context.beginPath();
        context.ellipse(x + len / 2, groundY - 2, len / 2 + 4, 6, 0, 0, Math.PI * 2);
        context.fill();
        // top face (depth)
        context.fillStyle = shade(car.color, 1.15);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + depth, y - depth * 0.6);
        context.lineTo(x + len + depth, y - depth * 0.6);
        context.lineTo(x + len, y);
        context.closePath();
        context.fill();
        // side face
        context.fillStyle = car.color;
        context.fillRect(x, y, len, bodyH);
        // crumpled zone
        if (car.crumple > 0) {
          context.fillStyle = 'rgba(30,38,51,.35)';
          const zone = Math.min(len * 0.35, car.crumple * px * 1.2);
          const zx = facing === 1 ? x + len - zone : x;
          context.beginPath();
          for (let i = 0; i <= 6; i += 1) {
            const yy = y + (bodyH / 6) * i;
            const xx = zx + (i % 2 ? zone : zone * 0.4);
            if (i === 0) context.moveTo(xx, yy); else context.lineTo(xx, yy);
          }
          context.lineTo(zx + (facing === 1 ? zone : 0), y + bodyH);
          context.lineTo(zx + (facing === 1 ? zone : 0), y);
          context.fill();
        }
        // cabin
        const cabX = x + len * 0.22, cabW = len * 0.5;
        context.fillStyle = shade(car.color, 0.85);
        context.beginPath();
        context.moveTo(cabX, y);
        context.lineTo(cabX + cabW * 0.18, y - roofH);
        context.lineTo(cabX + cabW * 0.82, y - roofH);
        context.lineTo(cabX + cabW, y);
        context.closePath();
        context.fill();
        context.fillStyle = 'rgba(220,240,252,.9)';
        context.fillRect(cabX + cabW * 0.25, y - roofH + 4, cabW * 0.5, roofH - 6);
        // wheels
        context.fillStyle = '#1E2633';
        for (const wx of [x + len * 0.2, x + len * 0.8]) {
          context.beginPath();
          context.arc(wx, groundY - 8, 8, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#A9B0BC';
          context.beginPath();
          context.arc(wx, groundY - 8, 3, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#1E2633';
        }
        // velocity arrow
        if (Math.abs(car.v) > 0.05) {
          const ax = x + len / 2, ay = y - roofH - 14, lenA = Math.min(80, Math.abs(car.v) * 3.2) * Math.sign(car.v);
          context.strokeStyle = '#1E2633';
          context.fillStyle = '#1E2633';
          context.lineWidth = 2.5;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(ax + lenA, ay);
          context.stroke();
          context.beginPath();
          context.moveTo(ax + lenA, ay);
          context.lineTo(ax + lenA - Math.sign(lenA) * 8, ay - 5);
          context.lineTo(ax + lenA - Math.sign(lenA) * 8, ay + 5);
          context.fill();
          context.font = '700 11px DM Sans, sans-serif';
          context.fillText(`${(car.v * 3.6).toFixed(0)} km/h`, ax + lenA / 2 - 22, ay - 6);
        }
      };
      const [c1, c2] = s.cars;
      if (c1) drawCar(c1, 1);
      if (c2) drawCar(c2, -1);
      for (const spark of s.sparks) {
        context.fillStyle = `rgba(255, ${150 + Math.round(spark.life * 100)}, 60, ${spark.life})`;
        context.fillRect(spark.x * px, groundY - 8 - spark.y * 14, 3, 3);
      }
      // slow-motion badge
      context.fillStyle = 'rgba(255,255,255,.85)';
      context.fillRect(10, 10, 132, 26);
      context.fillStyle = '#1E2633';
      context.font = '700 12px DM Sans, sans-serif';
      context.fillText(`${slow === 1 ? '▶ 1×' : `🐢 ${slow}×`}  t = ${s.time.toFixed(2)} s`, 18, 28);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, slow, e, mu]);

  const slider = (label: string, value: number, min: number, max: number, stepValue: number, unit: string, set: (n: number) => void) => (
    <label className="lab-slider"><span>{label}<b>{value}{unit}</b></span>
      <input type="range" min={min} max={max} step={stepValue} value={value} onChange={(event) => set(Number(event.target.value))} /></label>
  );
  return (
    <div className={compact ? 'stack' : 'chem-grid'}>
      <div className="panel chem-stage collision-stage">
        <canvas ref={canvas} className="chem-canvas" style={{ height: compact ? 260 : 330 }} />
        <div className="labwork-stopwatch">
          <button type="button" className="btn primary" onClick={() => { reset(); setRunning(true); }}><RotateCcw size={15} /> {t(language, 'Qaytadan', 'Заново', 'Replay')}</button>
          <button type="button" className="btn" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={15} /> : <Play size={15} />}</button>
          {[1, 0.25, 0.1].map((value) => (
            <button type="button" key={value} className={`btn small ${slow === value ? 'primary' : ''}`} onClick={() => setSlow(value)}>{value === 1 ? '1×' : `${value}×`}</button>
          ))}
        </div>
      </div>
      <div className="stack">
        <section className="panel">
          {slider(t(language, '1-mashina massasi', 'Масса машины 1', 'Car 1 mass'), m1, 600, 3000, 100, ' kg', setM1)}
          {slider(t(language, '1-mashina tezligi', 'Скорость машины 1', 'Car 1 speed'), v1, 0, 30, 1, ' m/s', setV1)}
          {slider(t(language, '2-mashina massasi', 'Масса машины 2', 'Car 2 mass'), m2, 600, 3000, 100, ' kg', setM2)}
          {slider(t(language, '2-mashina tezligi (− = qarshi)', 'Скорость машины 2 (− = навстречу)', 'Car 2 speed (− = towards)'), v2, -30, 10, 1, ' m/s', setV2)}
          {slider(t(language, 'Zarba elastikligi e', 'Упругость удара e', 'Elasticity e'), e, 0, 1, 0.05, '', setE)}
          {slider(t(language, 'Yo‘l ishqalanishi μ', 'Трение дороги μ', 'Road friction μ'), mu, 0.1, 0.9, 0.05, '', setMu)}
        </section>
        <section className="panel lab-result">
          <div className="lab-formula">p = m·v · E = m·v²/2</div>
          {result ? (
            <>
              <div className="collision-table">
                <span />
                <b>{t(language, 'Oldin', 'До', 'Before')}</b>
                <b>{t(language, 'Keyin', 'После', 'After')}</b>
                <span>{t(language, 'Impuls p', 'Импульс p', 'Momentum p')}</span>
                <span>{Math.round(result.p0).toLocaleString()} kg·m/s</span>
                <span>{Math.round(result.p1).toLocaleString()} kg·m/s</span>
                <span>{t(language, 'Kinetik energiya', 'Кинетическая энергия', 'Kinetic energy')}</span>
                <span>{(result.k0 / 1000).toFixed(1)} kJ</span>
                <span>{(result.k1 / 1000).toFixed(1)} kJ</span>
              </div>
              <p className="muted">{t(language,
                `Impuls saqlandi. ${((1 - result.k1 / Math.max(1, result.k0)) * 100).toFixed(0)}% energiya mashinalarni ezishga va issiqlikka ketdi.`,
                `Импульс сохранился. ${((1 - result.k1 / Math.max(1, result.k0)) * 100).toFixed(0)}% энергии ушло на смятие машин и нагрев.`,
                `Momentum is conserved. ${((1 - result.k1 / Math.max(1, result.k0)) * 100).toFixed(0)}% of the energy went into crumpling and heat.`)}</p>
            </>
          ) : (
            <p className="muted">{t(language, 'To‘qnashuvni kuting…', 'Дождитесь столкновения…', 'Wait for the collision…')}</p>
          )}
          <p className="muted">{t(language,
            'Nima uchun avtomobillarda deformatsiya zonasi bor? Zarba energiyasini yutib, yo‘lovchilarni himoya qiladi.',
            'Зачем у машин зона деформации? Она поглощает энергию удара и спасает пассажиров.',
            'Why do cars have crumple zones? They absorb the crash energy and protect passengers.')}</p>
        </section>
      </div>
    </div>
  );
}
