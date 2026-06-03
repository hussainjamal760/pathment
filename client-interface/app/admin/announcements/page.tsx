'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Pin, Loader2, ThumbsUp, CheckCircle2, Trash2, Send } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/admin';
import { announcementsApi } from '@/lib/services/announcements-api';
import { programsApi } from '@/lib/services/program-api';

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  const [programs, setPrograms] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    programsApi.getAll().then((r: any) => setPrograms(Array.isArray(r?.data) ? r.data : (r?.data?.programs ?? []))).catch(() => {});
  }, []);

  const post = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Add a title and message'); return; }
    try {
      setPosting(true);
      await announcementsApi.create({ title: title.trim(), body: body.trim(), audience });
      toast.success('Announcement posted');
      setTitle(''); setBody(''); setAudience('all');
      refetch();
    } catch { toast.error('Could not post'); }
    finally { setPosting(false); }
  };

  const act = async (id: string, fn: () => Promise<unknown>) => {
    try { setBusy(id); await fn(); refetch(); } catch { toast.error('Action failed'); } finally { setBusy(null); }
  };

  const filtered = useMemo(
    () => announcements.filter((a) => filter === 'all' || a.audience === filter),
    [announcements, filter]
  );

  const field = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2">Announcements</h1>
        <p className="text-slate-600">One place for org updates — no more scattered threads.</p>
      </div>

      {/* Composer */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-indigo-500" /><h2 className="text-slate-900">New announcement</h2></div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={field} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What do people need to know?" className={`${field} resize-none`} />
        <div className="flex flex-wrap items-center gap-2">
          <select value={audience} onChange={(e) => setAudience(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={post} disabled={posting} className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Post
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {['all', ...programs.map((p: any) => p.id)].map((p) => (
          <button key={p} onClick={() => setFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === p ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {p === 'all' ? 'All' : (programs.find((x: any) => x.id === p)?.name ?? 'Program')}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
          <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <div key={a.id} className={`bg-white rounded-2xl border p-5 ${a.pinned ? 'border-indigo-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {a.pinned && <Pin className="w-3.5 h-3.5 text-indigo-500" />}
                    <h3 className="font-medium text-slate-900">{a.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {a.author?.name}{a.author?.role ? ` · ${a.author.role}` : ''} · {a.audienceLabel} · {timeAgo(a.at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => act(a.id, () => announcementsApi.togglePin(a.id))} disabled={busy === a.id}
                    title={a.pinned ? 'Unpin' : 'Pin'} className={`p-1.5 rounded-lg hover:bg-slate-100 ${a.pinned ? 'text-indigo-600' : 'text-slate-400'}`}>
                    <Pin className="w-4 h-4" />
                  </button>
                  <button onClick={() => act(a.id, () => announcementsApi.remove(a.id))} disabled={busy === a.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{a.body}</p>
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => act(a.id, () => announcementsApi.react(a.id, 'acknowledged'))} disabled={busy === a.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${a.myReactions.includes('acknowledged') ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />Acknowledged {a.reactions.acknowledged > 0 && a.reactions.acknowledged}
                </button>
                <button onClick={() => act(a.id, () => announcementsApi.react(a.id, 'helpful'))} disabled={busy === a.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${a.myReactions.includes('helpful') ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <ThumbsUp className="w-3.5 h-3.5" />Helpful {a.reactions.helpful > 0 && a.reactions.helpful}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
