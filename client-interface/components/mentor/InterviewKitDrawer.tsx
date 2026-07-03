'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, GripVertical, Mic, Code2, Type, ChevronUp, ChevronDown, Volume2, Play, Square, User } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import {
  interviewApi,
  type InterviewQuestionInput,
  type InterviewQuestionKind,
  type InterviewTimingMode,
} from '@/lib/services/interview-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { speak, listVoices, VoiceRecorder, recorderSupported } from '@/lib/utils/interviewMedia';

const KIND_META: { kind: InterviewQuestionKind; label: string; icon: typeof Mic }[] = [
  { kind: 'voice', label: 'Voice', icon: Mic },
  { kind: 'code', label: 'Code', icon: Code2 },
  { kind: 'text', label: 'Written', icon: Type },
];

const blankQuestion = (kind: InterviewQuestionKind = 'voice'): InterviewQuestionInput => ({
  kind,
  prompt: '',
  points: 10,
  required: true,
  timeLimitSeconds: kind === 'code' ? 600 : 120,
  codeLanguage: kind === 'code' ? 'javascript' : undefined,
  starterCode: '',
  referenceAnswer: '',
});

/**
 * InterviewKitDrawer — create or edit an interview kit: meta (title, timing,
 * defaults) + an ordered question list (voice / code / written). Saving replaces
 * the whole question set server-side, so the editor just holds the current list.
 */
export function InterviewKitDrawer({
  kitId,
  onClose,
  onSaved,
}: {
  kitId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!kitId;
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [timingMode, setTimingMode] = useState<InterviewTimingMode>('per_question');
  const [totalMinutes, setTotalMinutes] = useState<number>(30);
  const [cameraDefault, setCameraDefault] = useState(false);
  const [aiGradingDefault, setAiGradingDefault] = useState(false);
  const [allowRetakeDefault, setAllowRetakeDefault] = useState(false);
  const [questions, setQuestions] = useState<InterviewQuestionInput[]>([blankQuestion()]);

  // Interviewer identity/voice (TTS): name + pitch + speed + a preferred voice.
  const [ivName, setIvName] = useState('');
  const [ivVoice, setIvVoice] = useState('');
  const [ivPitch, setIvPitch] = useState(1);
  const [ivRate, setIvRate] = useState(1);
  const [voices, setVoices] = useState<{ name: string; lang: string }[]>([]);

  // Browser TTS voices load asynchronously — read them now and on voiceschanged.
  useEffect(() => {
    const read = () => setVoices(listVoices().filter((v) => /^en/i.test(v.lang)));
    read();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = read;
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }
  }, []);

  // Load an existing kit for editing.
  useEffect(() => {
    if (!kitId) return;
    let active = true;
    setLoading(true);
    interviewApi.getKit(kitId)
      .then((res: any) => {
        if (!active) return;
        const k = res?.data?.kit;
        if (!k) { toast.error('Could not load kit'); onClose(); return; }
        setTitle(k.title || '');
        setDescription(k.description || '');
        setStatus(k.status || 'draft');
        setTimingMode(k.timingMode || 'per_question');
        setTotalMinutes(k.totalSeconds ? Math.round(k.totalSeconds / 60) : 30);
        setCameraDefault(!!k.cameraDefault);
        setAiGradingDefault(!!k.aiGradingDefault);
        setAllowRetakeDefault(!!k.allowRetakeDefault);
        const iv = k.settings?.interviewer || {};
        setIvName(iv.name || '');
        setIvVoice(iv.voiceName || '');
        setIvPitch(typeof iv.pitch === 'number' ? iv.pitch : 1);
        setIvRate(typeof iv.rate === 'number' ? iv.rate : 1);
        setQuestions((k.questions || []).length ? k.questions.map((q: any) => ({
          kind: q.kind, prompt: q.prompt, points: q.points, required: q.required,
          timeLimitSeconds: q.timeLimitSeconds, codeLanguage: q.codeLanguage || undefined,
          starterCode: q.starterCode || '', referenceAnswer: q.referenceAnswer || '',
          promptAudioUrl: q.config?.promptAudioUrl || null,
          promptAudioPublicId: q.config?.promptAudioPublicId || null,
        })) : [blankQuestion()]);
      })
      .catch((e: any) => { toast.error(extractApiErrorMessage(e, 'Could not load kit')); onClose(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kitId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchQuestion = (i: number, patch: Partial<InterviewQuestionInput>) =>
    setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const setKind = (i: number, kind: InterviewQuestionKind) =>
    patchQuestion(i, {
      kind,
      timeLimitSeconds: kind === 'code' ? 600 : 120,
      codeLanguage: kind === 'code' ? (questions[i].codeLanguage || 'javascript') : undefined,
    });

  const move = (i: number, dir: -1 | 1) =>
    setQuestions((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const removeQuestion = (i: number) =>
    setQuestions((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)));

  const totalPoints = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);

  const previewVoice = () => {
    speak(`Hi, I'm ${ivName.trim() || 'your interviewer'}. This is how I'll sound during the interview.`,
      { pitch: ivPitch, rate: ivRate, voiceName: ivVoice || null });
  };

  const save = async () => {
    if (saving) return;
    if (!title.trim()) { toast.error('Give the kit a title'); return; }
    const clean = questions
      .map((q) => ({ ...q, prompt: q.prompt.trim() }))
      .filter((q) => q.prompt);
    if (!clean.length) { toast.error('Add at least one question with a prompt'); return; }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      timingMode,
      totalSeconds: timingMode === 'total' ? Math.max(1, Math.round(totalMinutes * 60)) : null,
      cameraDefault,
      aiGradingDefault,
      allowRetakeDefault,
      interviewer: { name: ivName.trim() || null, voiceName: ivVoice || null, pitch: ivPitch, rate: ivRate },
      questions: clean.map((q) => ({
        kind: q.kind,
        prompt: q.prompt,
        points: Number(q.points) || 10,
        required: q.required !== false,
        timeLimitSeconds: timingMode === 'per_question' ? (Number(q.timeLimitSeconds) || undefined) : undefined,
        codeLanguage: q.kind === 'code' ? (q.codeLanguage || 'javascript') : undefined,
        starterCode: q.kind === 'code' ? (q.starterCode || null) : null,
        referenceAnswer: q.referenceAnswer?.trim() || null,
        // The mentor's recording (if any) rides in the question config; the
        // candidate hears it instead of TTS for that question.
        config: q.promptAudioUrl ? { promptAudioUrl: q.promptAudioUrl, promptAudioPublicId: q.promptAudioPublicId || null } : {},
      })),
    };

    try {
      setSaving(true);
      if (isEdit) await interviewApi.updateKit(kitId!, payload);
      else await interviewApi.createKit(payload);
      toast.success(isEdit ? 'Kit updated' : 'Kit created');
      onSaved();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not save kit'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={isEdit ? 'Edit interview kit' : 'New interview kit'}
      subtitle={`${questions.length} question${questions.length === 1 ? '' : 's'} · ${totalPoints} pts`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? 'Save changes' : 'Create kit'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : (
        <div className="space-y-6">
          {/* Meta */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend screen — React fundamentals" className={field} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this interview covers (optional)" className={field} />
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Status</span>
              <div className="flex flex-wrap gap-2">
                {([['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']] as const).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setStatus(val)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${status === val ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Only <span className="font-medium">Published</span> kits can be assigned. Draft = still building; Archived = retired (kept for interviews already assigned).
              </p>
            </div>
          </div>

          {/* Timing */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Timing</span>
            <div className="flex flex-wrap items-center gap-2">
              {([['per_question', 'Per-question timer'], ['total', 'One total timer']] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setTimingMode(val)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${timingMode === val ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {label}
                </button>
              ))}
              {timingMode === 'total' && (
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="number" min={1} value={totalMinutes} onChange={(e) => setTotalMinutes(Number(e.target.value))}
                    className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" /> minutes
                </span>
              )}
            </div>
          </div>

          {/* Defaults */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Defaults when assigning <span className="text-slate-400 font-normal">(overridable per mentee)</span></span>
            <div className="space-y-2">
              {([
                ['Allow re-attempt', allowRetakeDefault, setAllowRetakeDefault],
                ['Require camera (proctor snapshots)', cameraDefault, setCameraDefault],
                ['AI draft grading (BYO key)', aiGradingDefault, setAiGradingDefault],
              ] as const).map(([label, val, setter]) => (
                <label key={label} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Interviewer voice */}
          <div>
            <span className="text-sm font-medium text-slate-700 mb-1.5 inline-flex items-center gap-1.5"><User className="w-4 h-4 text-slate-400" />Interviewer voice</span>
            <div className="space-y-3 rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">Name
                  <input value={ivName} onChange={(e) => setIvName(e.target.value)} placeholder="e.g. Sheryar" className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-slate-500">Voice
                  <select value={ivVoice} onChange={(e) => setIvVoice(e.target.value)} className={`${field} mt-1`}>
                    <option value="">Default</option>
                    {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-500">Pitch (frequency) · {ivPitch.toFixed(1)}
                  <input type="range" min={0} max={2} step={0.1} value={ivPitch} onChange={(e) => setIvPitch(Number(e.target.value))} className="w-full mt-1 accent-brand-600" />
                </label>
                <label className="text-xs text-slate-500">Speed · {ivRate.toFixed(1)}×
                  <input type="range" min={0.5} max={2} step={0.1} value={ivRate} onChange={(e) => setIvRate(Number(e.target.value))} className="w-full mt-1 accent-brand-600" />
                </label>
              </div>
              <button type="button" onClick={previewVoice} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100">
                <Volume2 className="w-3.5 h-3.5" /> Preview voice
              </button>
              <p className="text-[11px] text-slate-400">Applies to every question. Voice choice is best-effort on the candidate&apos;s device; name, pitch and speed always apply. Record a question below to use your <span className="font-medium">real</span> voice for it.</p>
            </div>
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Questions</span>
              <span className="text-xs text-slate-400">{totalPoints} pts total</span>
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <GripVertical className="w-4 h-4 text-slate-300" />Question {i + 1}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="Move down" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button type="button" onClick={() => removeQuestion(i)} disabled={questions.length === 1} aria-label="Remove question" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* Kind */}
                  <div className="flex gap-1.5 mb-2.5">
                    {KIND_META.map(({ kind, label, icon: Icon }) => (
                      <button key={kind} type="button" onClick={() => setKind(i, kind)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${q.kind === kind ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                      </button>
                    ))}
                  </div>

                  <textarea value={q.prompt} onChange={(e) => patchQuestion(i, { prompt: e.target.value })} rows={2}
                    placeholder="The interviewer's question…" className={`${field} mb-2`} />

                  {/* Optional: record this question in your own voice (plays instead of TTS). */}
                  <PromptRecorder
                    url={q.promptAudioUrl || null}
                    onChange={(url, publicId) => patchQuestion(i, { promptAudioUrl: url, promptAudioPublicId: publicId })}
                  />

                  {q.kind === 'code' && (
                    <div className="grid grid-cols-2 gap-2 mb-2.5">
                      <input value={q.codeLanguage || ''} onChange={(e) => patchQuestion(i, { codeLanguage: e.target.value })}
                        placeholder="Language (e.g. javascript)" className={field} />
                      <input value={q.starterCode || ''} onChange={(e) => patchQuestion(i, { starterCode: e.target.value })}
                        placeholder="Starter code (optional)" className={field} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mb-2.5">
                    <label className="text-xs text-slate-500">
                      Points
                      <input type="number" min={0} value={q.points} onChange={(e) => patchQuestion(i, { points: Number(e.target.value) })} className={`${field} mt-1`} />
                    </label>
                    {timingMode === 'per_question' && (
                      <label className="text-xs text-slate-500">
                        Time limit (seconds)
                        <input type="number" min={0} value={q.timeLimitSeconds ?? ''} onChange={(e) => patchQuestion(i, { timeLimitSeconds: Number(e.target.value) })} className={`${field} mt-1`} />
                      </label>
                    )}
                  </div>

                  <textarea value={q.referenceAnswer || ''} onChange={(e) => patchQuestion(i, { referenceAnswer: e.target.value })} rows={2}
                    placeholder="Reference answer / rubric — only you (and AI) see this, never the candidate" className={`${field} bg-amber-50/40`} />

                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" checked={q.required !== false} onChange={(e) => patchQuestion(i, { required: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <span className="text-xs text-slate-600">Required</span>
                  </label>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setQuestions((prev) => [...prev, blankQuestion()])}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-brand-300 hover:text-brand-700">
              <Plus className="w-4 h-4" /> Add question
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** Record the mentor's own voice for a question prompt, upload it, and hand back
 *  the stored URL (played to the candidate instead of TTS for that question). */
function PromptRecorder({ url, onChange }: { url: string | null; onChange: (url: string | null, publicId?: string | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const recRef = useRef<VoiceRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!recorderSupported()) return null;

  const start = async () => {
    const rec = new VoiceRecorder();
    const ok = await rec.start();
    if (!ok) { toast.error('Microphone access is needed to record.'); return; }
    recRef.current = rec;
    setRecording(true);
  };

  const stop = async () => {
    const blob = await recRef.current?.stop();
    setRecording(false);
    if (!blob) return;
    setUploading(true);
    try {
      const res: any = await interviewApi.uploadPromptAudio(blob);
      onChange(res?.data?.url || null, res?.data?.publicId || null);
      toast.success('Recording saved');
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not upload the recording'));
    } finally {
      setUploading(false);
    }
  };

  const play = () => { if (url) { audioRef.current = new Audio(url); audioRef.current.play().catch(() => {}); } };

  return (
    <div className="flex items-center flex-wrap gap-2 mb-2.5">
      {recording ? (
        <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-red-500 text-white animate-pulse">
          <Square className="w-3.5 h-3.5" />Stop &amp; save
        </button>
      ) : (
        <button type="button" onClick={start} disabled={uploading}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
          {url ? 'Re-record in your voice' : 'Record in your voice'}
        </button>
      )}
      {url && !recording && (
        <>
          <button type="button" onClick={play} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"><Play className="w-3.5 h-3.5" />Play</button>
          <button type="button" onClick={() => onChange(null, null)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" />Remove</button>
          <span className="text-[11px] text-emerald-600">Your voice will play for this question</span>
        </>
      )}
    </div>
  );
}

export default InterviewKitDrawer;
