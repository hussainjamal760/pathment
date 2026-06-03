'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Users, Loader2, PartyPopper, Trophy, HelpCircle, Smile, Heart, ThumbsUp, Send } from 'lucide-react';
import { useCommunity, type CommunityPost } from '@/lib/hooks/mentee';
import { communityApi } from '@/lib/services/community-api';

const TYPES: { key: string; label: string; icon: typeof Trophy }[] = [
  { key: 'kudos', label: 'Kudos', icon: PartyPopper },
  { key: 'win', label: 'Win', icon: Trophy },
  { key: 'question', label: 'Question', icon: HelpCircle },
  { key: 'meme', label: 'Meme', icon: Smile },
];

const TYPE_CLASS: Record<string, string> = {
  kudos: 'bg-pink-100 text-pink-700',
  win: 'bg-emerald-100 text-emerald-700',
  question: 'bg-blue-100 text-blue-700',
  meme: 'bg-amber-100 text-amber-700',
};

export default function MenteeCommunity() {
  const { feed, shoutouts, stats, people, loading, error, refetch } = useCommunity();
  const [type, setType] = useState('win');
  const [toId, setToId] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const post = async () => {
    if (!body.trim()) { toast.error('Say something first'); return; }
    try {
      setPosting(true);
      await communityApi.createPost({ type, body: body.trim(), toId: type === 'kudos' ? (toId || undefined) : undefined });
      toast.success('Posted');
      setBody(''); setToId('');
      refetch();
    } catch { toast.error('Could not post'); }
    finally { setPosting(false); }
  };

  const react = async (id: string, t: 'cheers' | 'helpful') => {
    try { setBusy(id + t); await communityApi.react(id, t); refetch(); } catch { toast.error('Could not react'); } finally { setBusy(null); }
  };

  const PostCard = ({ p }: { p: CommunityPost }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center shrink-0"><span className="text-indigo-700 text-xs font-medium">{p.author.avatar}</span></div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {p.author.name}
            {p.type === 'kudos' && p.recipient && <span className="text-slate-500 font-normal"> → {p.recipient.name}</span>}
          </p>
          <p className="text-xs text-slate-400">{p.at ? new Date(p.at).toLocaleDateString() : ''}</p>
        </div>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_CLASS[p.type]}`}>{p.type}</span>
      </div>
      <p className={`mt-3 text-slate-700 ${p.type === 'meme' ? 'text-base' : 'text-sm'} whitespace-pre-wrap`}>{p.body}</p>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={() => react(p.id, 'cheers')} disabled={busy === p.id + 'cheers'}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${p.myReactions.includes('cheers') ? 'border-pink-300 bg-pink-50 text-pink-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
          <Heart className="w-3.5 h-3.5" />Cheers {p.reactions.cheers > 0 && p.reactions.cheers}
        </button>
        <button onClick={() => react(p.id, 'helpful')} disabled={busy === p.id + 'helpful'}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${p.myReactions.includes('helpful') ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
          <ThumbsUp className="w-3.5 h-3.5" />Helpful {p.reactions.helpful > 0 && p.reactions.helpful}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Community</h1>
        <p className="text-slate-600">Cheer each other on — wins, questions, kudos, and the odd meme.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          {/* Composer */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => setType(t.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${type === t.key ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <t.icon className="w-4 h-4" />{t.label}
                </button>
              ))}
            </div>
            {type === 'kudos' && (
              <select value={toId} onChange={(e) => setToId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Who's it for? (optional)</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
              placeholder={type === 'question' ? 'Ask the cohort…' : type === 'kudos' ? 'Give someone a shout-out…' : "Share what's up…"}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex justify-end">
              <button onClick={post} disabled={posting} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Post
              </button>
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-indigo-600" /></div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
              <p className="text-slate-600 mb-3">{error}</p>
              <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
            </div>
          ) : feed.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">Be the first to post.</p>
            </div>
          ) : (
            feed.map((p) => <PostCard key={p.id} p={p} />)
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Motivation for you</h3>
            {shoutouts.length === 0 ? (
              <p className="text-sm text-slate-500">No shout-outs yet — keep showing up.</p>
            ) : (
              <div className="space-y-2">
                {shoutouts.map((s) => (
                  <div key={s.id} className="p-3 rounded-xl bg-pink-50 border border-pink-100">
                    <p className="text-sm text-slate-700">{s.body}</p>
                    <p className="text-xs text-slate-400 mt-1">from {s.author.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stats && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-3">Your community</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Shout-outs given</span><span className="font-semibold text-slate-900">{stats.given}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cheers received</span><span className="font-semibold text-slate-900">{stats.cheersReceived}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Posts in cohort</span><span className="font-semibold text-slate-900">{stats.posts}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
