'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, UserMinus } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { poolsApi } from '@/lib/services/pools-api';
import type { ImportResult, PoolBucket, PoolDashboard, PoolMemberRow } from '@/lib/types/pool';
import { apiError, BUCKET_CLASS, BUCKET_LABEL, DECISION_CLASS, DECISION_LABEL, field, pill, primaryBtn, secondaryBtn } from './poolUi';

const RESULT_LABEL: Record<ImportResult['result'], string> = {
  added: 'Added', invited: 'Invited', already_in_pool: 'Already in pool', duplicate_row: 'Repeated in list', invalid: 'Not an email', pool_full: 'Pool full',
};

/** Pull emails out of pasted text or a CSV, whatever the separators. */
const parseEmails = (text: string) => text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.includes('@'));

export function CandidatesTab({ data, canMembers, onChanged }: { data: PoolDashboard; canMembers: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [bucket, setBucket] = useState<PoolBucket | 'all'>('all');
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<PoolMemberRow | null>(null);
  const rows = useMemo(() => data.members.filter((m) => bucket === 'all' || m.bucket === bucket), [data.members, bucket]);
  const closed = ['placing', 'closed'].includes(data.pool.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setBucket('all')} className={`${pill} ${bucket === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>All {data.members.length}</button>
        {(Object.keys(data.buckets) as PoolBucket[]).map((b) => (
          <button key={b} onClick={() => setBucket(b)} className={`${pill} ${bucket === b ? 'bg-brand-600 text-white' : BUCKET_CLASS[b]}`}>
            {BUCKET_LABEL[b]} {data.buckets[b]}
          </button>
        ))}
        {canMembers && !closed && (
          <button onClick={() => setImporting(true)} className={`${secondaryBtn} ml-auto`}><Upload className="w-4 h-4" />Add candidates</button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-10 text-center text-sm text-slate-500">No candidates here.</div>
      ) : (
        <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {rows.map((m) => (
            <div key={m.id} className="p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{m.name || m.email}</p>
                <p className="text-xs text-slate-500 truncate">{m.name ? m.email : null}{m.tasksTotal ? `${m.name ? ' · ' : ''}${m.tasksCompleted}/${m.tasksTotal} done` : ''}</p>
                {m.decisionReason && <p className="text-xs text-slate-400 mt-0.5">{m.decisionReason}</p>}
              </div>
              <span className={`${pill} ${m.decision ? DECISION_CLASS[m.decision] : BUCKET_CLASS[m.bucket]}`}>
                {m.decision ? DECISION_LABEL[m.decision] : BUCKET_LABEL[m.bucket]}
              </span>
              {canMembers && !m.decision && !closed && (
                <button aria-label="Withdraw or disqualify" onClick={() => setRemoving(m)} className="p-1.5 text-slate-400 hover:text-red-600"><UserMinus className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {importing && <ImportDrawer poolId={data.pool.id} onClose={() => setImporting(false)} onDone={onChanged} />}
      {removing && (
        <RemoveDrawer
          member={removing}
          onClose={() => setRemoving(null)}
          onSubmit={async (decision, reason) => {
            const ok = await confirm({ title: `${decision === 'withdrawn' ? 'Withdraw' : 'Disqualify'} ${removing.name || removing.email}?`, description: 'Their open work is cancelled and reminders stop.', variant: 'danger' });
            if (!ok) return;
            try {
              await poolsApi.removeMember(data.pool.id, removing.id, decision, reason);
              toast.success('Candidate updated');
              setRemoving(null);
              onChanged();
            } catch (e) { toast.error(apiError(e, 'Could not update the candidate')); }
          }}
        />
      )}
    </div>
  );
}

function ImportDrawer({ poolId, onClose, onDone }: { poolId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const emails = parseEmails(text);

  const readFile = async (file?: File) => { if (file) setText(await file.text()); };
  const submit = async () => {
    try {
      setBusy(true);
      const res = await poolsApi.importMembers(poolId, emails);
      setResults(res.data.results);
      onDone();
    } catch (e) { toast.error(apiError(e, 'Could not add candidates')); } finally { setBusy(false); }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Add candidates"
      subtitle="People with an account join now; everyone else gets an invite. Safe to run twice."
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className={secondaryBtn}>{results ? 'Done' : 'Cancel'}</button>
          {!results && (
            <button onClick={submit} disabled={busy || !emails.length} className={primaryBtn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Add {emails.length || ''}
            </button>
          )}
        </div>
      )}
    >
      {results ? (
        <div className="divide-y divide-slate-100">
          {results.map((r, i) => (
            <div key={`${r.email}-${i}`} className="py-2 flex items-center justify-between text-sm">
              <span className="truncate text-slate-700">{r.email}</span>
              <span className={`${pill} ${['added', 'invited'].includes(r.result) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{RESULT_LABEL[r.result]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste emails, one per line or comma separated" className={field} />
          <label className="inline-flex items-center gap-2 text-sm text-brand-600 cursor-pointer">
            <Upload className="w-4 h-4" />Or choose a CSV file
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          <p className="text-xs text-slate-400">{emails.length} email(s) found.</p>
        </div>
      )}
    </Drawer>
  );
}

function RemoveDrawer({ member, onClose, onSubmit }: {
  member: PoolMemberRow;
  onClose: () => void;
  onSubmit: (decision: 'withdrawn' | 'disqualified', reason: string) => Promise<void>;
}) {
  const [decision, setDecision] = useState<'withdrawn' | 'disqualified'>('withdrawn');
  const [reason, setReason] = useState('');
  return (
    <Drawer
      open
      onClose={onClose}
      title="Remove from the running"
      subtitle={member.name || member.email}
      width="sm"
      footer={() => (
        <div className="flex justify-end">
          <button onClick={() => onSubmit(decision, reason.trim())} disabled={!reason.trim()} className={primaryBtn}>Continue</button>
        </div>
      )}
    >
      <div className="space-y-3">
        {(['withdrawn', 'disqualified'] as const).map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" checked={decision === d} onChange={() => setDecision(d)} />{DECISION_LABEL[d]}
          </label>
        ))}
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (kept in the audit history)" className={field} />
      </div>
    </Drawer>
  );
}
