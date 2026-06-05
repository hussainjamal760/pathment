'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Loader2, X, CheckCircle2, XCircle, FileSpreadsheet,
  Mail, Phone, Check,
} from 'lucide-react';
import {
  useCohortApplications,
  type Application,
  type ApplicationStatus,
} from '@/lib/hooks/admin';
import { cohortApi } from '@/lib/services/intake-api';

const STATUS_TABS: { key: ApplicationStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'under_review', label: 'Under review' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'waitlisted', label: 'Waitlisted' },
];

const STATUS_CHIP: Record<ApplicationStatus, string> = {
  pending:         'bg-slate-100 text-slate-600',
  assessment_sent: 'bg-blue-50 text-blue-700',
  under_review:    'bg-amber-50 text-amber-700',
  accepted:        'bg-emerald-50 text-emerald-700',
  rejected:        'bg-rose-50 text-rose-700',
  waitlisted:      'bg-purple-50 text-purple-700',
};

/** Minimal CSV → array of header→value objects (parses every column). */
function parseCsvToRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

function fullName(a: Application) {
  return `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.email;
}

function ApplicationDrawer({
  app, onClose, onUpdate, onAccept, onReject,
}: {
  app: Application;
  onClose: () => void;
  onUpdate: (id: string, data: { status?: string; assessmentScore?: number; reviewerNotes?: string }) => Promise<void>;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}) {
  const [score, setScore] = useState(app.assessmentScore != null ? String(app.assessmentScore) : '');
  const [notes, setNotes] = useState(app.reviewerNotes ?? '');
  const [busy, setBusy] = useState(false);
  const decided = app.status === 'accepted' || app.status === 'rejected';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const responses = app.responses ?? {};
  const entries = Object.entries(responses).filter(([k]) => !['email', 'role'].includes(k.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="relative w-full max-w-lg h-full bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-slate-900 font-medium">{fullName(app)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</span>
              {app.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{app.phone}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[app.status]}`}>{app.status.replace(/_/g, ' ')}</span>
            {app.programPreference && <span className="text-xs text-slate-500">wants: {app.programPreference}</span>}
            {app.user && <span className="text-xs text-emerald-600">· registered</span>}
          </div>

          {/* Review */}
          {!decided && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-700">Review</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Assessment score</label>
                  <input type="number" min={0} max={100} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="flex items-end">
                  <select value={app.status} onChange={(e) => run(() => onUpdate(app.id, { status: e.target.value }))} disabled={busy} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="pending">Pending</option>
                    <option value="assessment_sent">Assessment sent</option>
                    <option value="under_review">Under review</option>
                    <option value="waitlisted">Waitlisted</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Reviewer notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button
                onClick={() => run(() => onUpdate(app.id, { assessmentScore: score === '' ? undefined : Number(score), reviewerNotes: notes }))}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700"
              >
                <Check className="w-4 h-4" /> Save review
              </button>
            </div>
          )}

          {/* Intake answers */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Application details</p>
            {entries.length === 0 ? (
              <p className="text-sm text-slate-400">No additional fields.</p>
            ) : (
              <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {entries.map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-2">
                    <dt className="w-40 shrink-0 text-xs font-medium text-slate-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                    <dd className="text-sm text-slate-700 break-words">{String(v ?? '') || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        {!decided && (
          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
            <button onClick={() => run(() => onReject(app.id))} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg">
              <XCircle className="w-4 h-4" /> Reject
            </button>
            <button onClick={() => run(() => onAccept(app.id))} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Accept & invite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CohortReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const {
    cohort, applications, loading, statusFilter, setStatusFilter,
    refetch, importRows, updateApplication, acceptApplication, rejectApplication,
  } = useCohortApplications(id);

  const [open, setOpen] = useState<Application | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { toast.error('Please upload a .csv file'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rows = parseCsvToRows(e.target?.result as string);
      if (rows.length === 0) { toast.error('No rows found. Ensure the CSV has a header row with an "email" column.'); return; }
      setImporting(true);
      await importRows(rows);
      setImporting(false);
    };
    reader.readAsText(file);
  };

  // Keep the open drawer in sync with refetched data.
  const liveOpen = open ? applications.find((a) => a.id === open.id) ?? open : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/cohorts" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft className="w-5 h-5" /> Back to cohorts
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-slate-900">{cohort?.name ?? 'Cohort'}</h1>
            <p className="text-slate-600 text-sm">{cohort?.program?.name ?? ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {cohort && (
              <select
                value={cohort.status}
                onChange={(e) => cohortApi.update(id, { status: e.target.value }).then(refetch).catch(() => toast.error('Failed to update status'))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="planning">Planning</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
              </select>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-brand-400">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); if (fileRef.current) fileRef.current.value = ''; }} />
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${statusFilter === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No applications here yet — import a CSV to bring applicants in.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">Applicant</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Wants</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3 hidden sm:table-cell">Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(a)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{fullName(a)}</p>
                    <p className="text-xs text-slate-500">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-600">{a.programPreference || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[a.status]}`}>{a.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-600">{a.assessmentScore != null ? a.assessmentScore : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-brand-600 text-xs font-medium">Review</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {liveOpen && (
        <ApplicationDrawer
          app={liveOpen}
          onClose={() => setOpen(null)}
          onUpdate={updateApplication}
          onAccept={acceptApplication}
          onReject={rejectApplication}
        />
      )}
    </div>
  );
}
