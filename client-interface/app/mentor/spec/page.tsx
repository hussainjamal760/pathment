'use client';

import { useState } from 'react';
import { BookOpen, Compass, HeartHandshake, ShieldCheck, Clock, ChevronDown, CheckCircle2 } from 'lucide-react';

const PRINCIPLES = [
  { icon: Compass, title: 'Guide, don’t gatekeep', body: 'Point the way and let mentees own the journey. Your read informs, it never decides for them.' },
  { icon: HeartHandshake, title: 'Measure fairly', body: 'Judge progress against each person’s real constraints — accepted friction counts in their favour.' },
  { icon: ShieldCheck, title: 'Be consistent', body: 'Reliable, timely feedback beats occasional brilliance. Small steady touches keep momentum.' },
  { icon: BookOpen, title: 'Make work concrete', body: 'Clear deliverables and acceptance criteria. Vague asks create vague results.' },
  { icon: Clock, title: 'Respect their time', body: 'Keep reviews fast and low-friction. Fast in, fast out — for them and for you.' },
  { icon: CheckCircle2, title: 'Close the loop', body: 'Every submission gets a decision and a reason. Silence is the worst feedback.' },
];

const RESPONSIBILITIES = [
  'Review submissions promptly with a clear decision and a useful note.',
  'Keep an eye on your cohort’s at-risk signals and reach out early.',
  'Accept genuine friction so progress is measured fairly.',
  'Run regular 1:1s and capture what matters in notes.',
  'Nominate mentees who are ready to grow into co-mentors.',
];

const CONDUCT = [
  'Treat every mentee with respect and patience.',
  'Keep personal information shared in 1:1s confidential.',
  'Give feedback on the work, not the person.',
  'Flag conflicts of interest to an admin.',
  'No discrimination, harassment, or favouritism — ever.',
];

const TIME = [
  { value: '~3h', label: 'per week, typical' },
  { value: '24h', label: 'target review turnaround' },
  { value: '1×', label: 'weekly 1:1 per mentee' },
];

const FAQS = [
  { q: 'How fast should I review submissions?', a: 'Aim for within 24 hours. The Approvals queue surfaces what’s waiting and lets you bulk-approve on-time work.' },
  { q: 'What does “measured fairly” mean?', a: 'A mentee can log real constraints (job, power cuts, hardware). When you accept a delay, it lifts their relative progress so they aren’t punished for things outside their control.' },
  { q: 'When should I escalate someone as at-risk?', a: 'The At-risk view separates “struggling despite effort” from “going quiet”. Nudge early; escalate to an admin if someone goes silent for over a week.' },
  { q: 'How do roadmaps work?', a: 'Build (or import) an ordered set of steps and assign it. Approving a step automatically assigns the next one.' },
  { q: 'Can a mentee become a co-mentor?', a: 'Yes — nominate them in Promotions. After an interview and approval, an admin finalises the promotion.' },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-medium text-slate-900">{q}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="px-4 pb-4 text-sm text-slate-600">{a}</p>}
    </div>
  );
}

export default function MentorSpec() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-slate-900 mb-2">Mentor handbook</h1>
        <p className="text-slate-600">How we mentor at Pathment — the principles, the responsibilities, the bar.</p>
      </div>

      {/* Principles */}
      <div className="grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
              <p.icon className="w-4 h-4 text-indigo-600" />
            </div>
            <h3 className="font-medium text-slate-900">{p.title}</h3>
            <p className="text-sm text-slate-600 mt-1">{p.body}</p>
          </div>
        ))}
      </div>

      {/* Time commitment */}
      <div className="grid grid-cols-3 gap-4">
        {TIME.map((t) => (
          <div key={t.label} className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
            <div className="text-2xl font-semibold text-indigo-700 tabular-nums">{t.value}</div>
            <div className="text-xs text-slate-500 mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Responsibilities + conduct */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-3">Your responsibilities</h2>
          <ul className="space-y-2">
            {RESPONSIBILITIES.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />{r}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-3">Code of conduct</h2>
          <ul className="space-y-2">
            {CONDUCT.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-slate-700">
                <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />{c}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* FAQs */}
      <div>
        <h2 className="text-slate-900 mb-3">FAQs</h2>
        <div className="space-y-2">
          {FAQS.map((f) => <FaqItem key={f.q} {...f} />)}
        </div>
      </div>
    </div>
  );
}
