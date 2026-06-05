'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen, GraduationCap, FileText, ShieldCheck, Search, Plus, X, Pin, Trash2, ExternalLink, Clock, Loader2,
} from 'lucide-react';
import { useLibrary, type LibraryDoc } from '@/lib/hooks/mentor';
import { libraryApi } from '@/lib/services/library-api';

const CATEGORIES = ['guidance', 'reading', 'template', 'policy'] as const;
const CAT_META: Record<string, { icon: typeof BookOpen; cls: string }> = {
  guidance: { icon: GraduationCap, cls: 'bg-brand-50 text-brand-700' },
  reading: { icon: BookOpen, cls: 'bg-sky-50 text-sky-700' },
  template: { icon: FileText, cls: 'bg-emerald-50 text-emerald-700' },
  policy: { icon: ShieldCheck, cls: 'bg-amber-50 text-amber-700' },
};

function DocCard({ d, onPin, onRemove, busy }: { d: LibraryDoc; onPin: () => void; onRemove: () => void; busy: boolean }) {
  const meta = CAT_META[d.category] || CAT_META.guidance;
  const Icon = meta.icon;
  return (
    <div className={`group bg-white rounded-2xl border p-5 ${d.pinned ? 'border-brand-200' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${meta.cls}`}><Icon className="w-4 h-4" /></div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onPin} disabled={busy} title={d.pinned ? 'Unpin' : 'Pin'} className={`p-1.5 rounded-lg hover:bg-slate-100 ${d.pinned ? 'text-brand-600' : 'text-slate-400'}`}><Pin className="w-4 h-4" /></button>
          <button onClick={onRemove} disabled={busy} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${meta.cls}`}>{d.category}</span>
        {d.pinned && <span className="inline-flex items-center gap-1 text-xs text-brand-600"><Pin className="w-3 h-3" />Pinned</span>}
      </div>
      <h3 className="mt-2 font-medium text-slate-900 leading-snug">{d.title}</h3>
      {d.summary && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{d.summary}</p>}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        {d.author && <span className="truncate">{d.author}</span>}
        {d.readMins ? (<><span>·</span><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{d.readMins} min</span></>) : null}
        {d.url && (
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:text-brand-700">
            Read <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function MentorLibrary() {
  const { documents, loading, error, refetch } = useLibrary();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // add form
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('guidance');
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');
  const [readMins, setReadMins] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (q && !(`${d.title} ${d.summary || ''} ${d.author || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [documents, query, category]);

  const pinned = filtered.filter((d) => d.pinned);
  const rest = filtered.filter((d) => !d.pinned);

  const add = async () => {
    if (!title.trim()) { toast.error('Title required'); return; }
    try {
      setBusy('add');
      await libraryApi.create({ title: title.trim(), category: cat, summary: summary.trim() || undefined, url: url.trim() || undefined, readMins: readMins.trim() ? Number(readMins) : undefined });
      toast.success('Document added');
      setTitle(''); setCat('guidance'); setSummary(''); setUrl(''); setReadMins(''); setAdding(false);
      refetch();
    } catch { toast.error('Could not add'); } finally { setBusy(null); }
  };

  const act = async (id: string, fn: () => Promise<unknown>) => {
    try { setBusy(id); await fn(); refetch(); } catch { toast.error('Action failed'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Library</h1>
          <p className="text-slate-600">Mentorship guidance, reading, templates and policies — shared across the org.</p>
        </div>
        <button onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" />Add document
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={readMins} onChange={(e) => setReadMins(e.target.value)} type="number" placeholder="min read" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (optional)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Summary (optional)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="flex justify-end">
            <button onClick={add} disabled={busy === 'add'} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add
            </button>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, summary, author…"
            className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {['all', ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${category === c ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No documents{query || category !== 'all' ? ' match your filters' : ' yet'}.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pinned.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {pinned.map((d) => <DocCard key={d.id} d={d} busy={busy === d.id} onPin={() => act(d.id, () => libraryApi.togglePin(d.id))} onRemove={() => act(d.id, () => libraryApi.remove(d.id))} />)}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rest.map((d) => <DocCard key={d.id} d={d} busy={busy === d.id} onPin={() => act(d.id, () => libraryApi.togglePin(d.id))} onRemove={() => act(d.id, () => libraryApi.remove(d.id))} />)}
          </div>
        </div>
      )}
    </div>
  );
}
