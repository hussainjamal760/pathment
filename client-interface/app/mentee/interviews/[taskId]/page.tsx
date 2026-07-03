'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Mic, MicOff, Loader2, ArrowRight, CheckCircle2, Video, Volume2,
  Code2, Type, AlertTriangle, Play, RotateCcw,
} from 'lucide-react';
import {
  interviewApi, type CandidateInterview, type CandidateQuestion,
} from '@/lib/services/interview-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import {
  speak, stopSpeaking, createRecognizer, VoiceRecorder,
  recognitionSupported, recorderSupported, fmtClock,
} from '@/lib/utils/interviewMedia';
import { useProctor } from '@/lib/hooks/mentee/useProctor';
import { Maximize2, Eye } from 'lucide-react';

type Phase = 'loading' | 'intro' | 'active' | 'submitting' | 'done' | 'error';
interface Draft { transcript: string; code: string; answerText: string; seconds: number; audioBlob: Blob | null }

export default function InterviewRunnerPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<CandidateInterview | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [totalRemaining, setTotalRemaining] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const recognizerRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const questions = data?.questions ?? [];
  const q: CandidateQuestion | undefined = questions[idx];
  const draft = q ? drafts[q.id] : undefined;

  // Proctoring — active only while the interview is running.
  const proctor = useProctor({
    sessionId,
    active: phase === 'active',
    videoRef,
    cameraRequired: !!data?.options.cameraRequired,
  });

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    interviewApi.getCandidateInterview(taskId)
      .then((res: any) => {
        if (!active) return;
        const d: CandidateInterview = res?.data;
        setData(d);
        // Seed drafts from any saved answers (resume).
        const seed: Record<string, Draft> = {};
        d.questions.forEach((qq) => {
          const saved = d.state.savedAnswers.find((a) => a.questionId === qq.id);
          seed[qq.id] = {
            transcript: saved?.transcript || '',
            code: saved?.code ?? qq.starterCode ?? '',
            answerText: saved?.answerText || '',
            seconds: saved?.timeSpentSeconds || 0,
            audioBlob: null,
          };
        });
        setDrafts(seed);
        setPhase('intro');
      })
      .catch((e: any) => { if (active) { setErrorMsg(extractApiErrorMessage(e, 'Could not load this interview')); setPhase('error'); } });
    return () => { active = false; };
  }, [taskId]);

  // ── Camera preview (when required) ───────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (!data?.options.cameraRequired) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      camStreamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      return true;
    } catch {
      toast.error('Camera access is required for this interview. Please allow it and retry.');
      return false;
    }
  }, [data?.options.cameraRequired]);

  // Attach the stream once the <video> mounts in the active phase.
  useEffect(() => {
    if (phase === 'active' && videoRef.current && camStreamRef.current) {
      videoRef.current.srcObject = camStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  // ── Per-question timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !q) return;
    const total = data?.options.timingMode === 'per_question' ? q.timeLimitSeconds : null;
    setRemaining(total ?? null);
    if (!total) return;
    const started = Date.now();
    const tick = setInterval(() => {
      const left = total - Math.floor((Date.now() - started) / 1000);
      setRemaining(left);
      // Count elapsed time onto the draft.
      setDrafts((prev) => q ? { ...prev, [q.id]: { ...prev[q.id], seconds: (prev[q.id]?.seconds || 0) + 1 } } : prev);
      if (left <= 0) { clearInterval(tick); advance(true); }
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  // ── Global total timer (only in 'total' timing mode) ─────────────────────────
  // Runs once across the whole interview and force-finishes when it hits zero,
  // regardless of which question the candidate is on.
  useEffect(() => {
    if (phase !== 'active' || data?.options.timingMode !== 'total') return;
    const total = data?.options.totalSeconds;
    if (!total) return;
    setTotalRemaining(total);
    const started = Date.now();
    const tick = setInterval(() => {
      const left = total - Math.floor((Date.now() - started) / 1000);
      setTotalRemaining(left);
      if (left <= 0) { clearInterval(tick); finish(); }
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Speak the prompt when arriving at a question.
  useEffect(() => {
    if (phase === 'active' && q) speak(q.prompt);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  // ── Autosave the current draft (debounced) ───────────────────────────────────
  const queueSave = useCallback((questionId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }));
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const d = { ...drafts[questionId], ...patch };
      interviewApi.saveAnswer(sessionId, {
        questionId,
        transcript: d.transcript || null,
        code: d.code || null,
        answerText: d.answerText || null,
        timeSpentSeconds: d.seconds,
      }).catch(() => { /* autosave is best-effort */ });
    }, 1200);
  }, [sessionId, drafts]);

  // ── Recording (voice questions) ──────────────────────────────────────────────
  const toggleRecording = async () => {
    if (!q) return;
    if (recording) {
      recognizerRef.current?.stop();
      const blob = await recorderRef.current?.stop();
      setRecording(false);
      if (blob) queueSave(q.id, { audioBlob: blob });
      return;
    }
    const rec = new VoiceRecorder();
    const ok = await rec.start();
    if (!ok) { toast.error('Microphone access is needed to answer by voice.'); return; }
    recorderRef.current = rec;
    recognizerRef.current = createRecognizer((text) => queueSave(q.id, { transcript: text }));
    recognizerRef.current?.start();
    setRecording(true);
  };

  // ── Start / advance / submit ─────────────────────────────────────────────────
  const begin = async () => {
    if (!(await startCamera())) return;
    try {
      const res: any = await interviewApi.startInterview(taskId);
      setSessionId(res?.data?.session?.id);
      setIdx(0);
      setPhase('active');
      // Lock to fullscreen for the proctored session (best-effort).
      await proctor.requestFullscreen();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not start the interview'));
    }
  };

  const persistCurrent = async () => {
    if (!q || !sessionId) return;
    const d = drafts[q.id];
    // Stop any in-flight recording first so we capture the final blob.
    let blob = d?.audioBlob || null;
    if (recording) {
      recognizerRef.current?.stop();
      blob = (await recorderRef.current?.stop()) || blob;
      setRecording(false);
    }
    await interviewApi.saveAnswer(sessionId, {
      questionId: q.id,
      transcript: d?.transcript || null,
      code: d?.code || null,
      answerText: d?.answerText || null,
      timeSpentSeconds: d?.seconds || 0,
    }).catch(() => {});
    if (blob) {
      await interviewApi.uploadAnswerAudio(sessionId, q.id, blob).catch(() => {
        toast.error('Your audio failed to upload, but your transcript was saved.');
      });
    }
  };

  const advance = async (auto = false) => {
    if (advancing) return;
    setAdvancing(true);
    stopSpeaking();
    try {
      await persistCurrent();
      if (idx < questions.length - 1) {
        setIdx((i) => i + 1);
      } else {
        await finish();
      }
    } finally {
      setAdvancing(false);
    }
    if (auto) toast.message('Time up — moving to the next question.');
  };

  const finish = async () => {
    if (!sessionId) return;
    setPhase('submitting');
    try {
      await proctor.flush(); // push any buffered proctor events before we submit
      await interviewApi.submitInterview(sessionId);
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setPhase('done');
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not submit the interview'));
      setPhase('active');
    }
  };

  // Cleanup media on unmount.
  useEffect(() => () => {
    stopSpeaking();
    recognizerRef.current?.stop();
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // ── Renders ──────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return <Centered><Loader2 className="w-7 h-7 animate-spin text-slate-300" /></Centered>;
  }

  if (phase === 'error') {
    return (
      <Centered>
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-slate-900 font-medium">{errorMsg}</p>
          <button onClick={() => router.push(`/mentee/tasks/${taskId}`)} className="mt-5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm">Back to task</button>
        </div>
      </Centered>
    );
  }

  if (phase === 'done') {
    return (
      <Centered>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Interview submitted</h1>
          <p className="text-slate-500 mt-2">Nice work. Your mentor will review your answers and share feedback. You&apos;ll see it on your task page.</p>
          <button onClick={() => router.push(`/mentee/tasks/${taskId}`)} className="mt-6 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium">Back to task</button>
        </div>
      </Centered>
    );
  }

  if (phase === 'intro') {
    const submittedBefore = (data?.state.submittedCount || 0) > 0;
    const resuming = !!data?.state.activeSessionId;
    const cannot = !data?.state.canStart && !resuming;
    return (
      <Centered>
        <div className="max-w-lg w-full">
          <div className="rounded-2xl border border-slate-200 bg-card p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
              <Mic className="w-7 h-7 text-brand-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">{data?.kit.title}</h1>
            {data?.kit.description && <p className="text-slate-500 mt-1.5">{data.kit.description}</p>}

            <div className="flex items-center justify-center gap-5 mt-5 text-sm text-slate-600">
              <span>{questions.length} question{questions.length === 1 ? '' : 's'}</span>
              <span className="tabular-nums">{data?.kit.totalPoints} pts</span>
              <span>{data?.options.timingMode === 'total' ? `${Math.round((data?.options.totalSeconds || 0) / 60)} min total` : 'Timed per question'}</span>
            </div>

            <ul className="text-left text-sm text-slate-600 mt-6 space-y-2 bg-slate-50 rounded-xl p-4">
              <li className="flex gap-2"><Volume2 className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />Each question is read aloud, like a real interviewer.</li>
              <li className="flex gap-2"><Mic className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />Answer by voice — we transcribe and keep your recording.</li>
              {data?.options.cameraRequired && <li className="flex gap-2"><Video className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />Your camera stays on during the interview.</li>}
              <li className="flex gap-2"><ArrowRight className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />You can&apos;t go back to a question once you move on.</li>
              {!data?.options.allowRetake && <li className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />One attempt only — make it count.</li>}
            </ul>

            {!recognitionSupported() && (
              <p className="text-xs text-amber-600 mt-4">Live transcription isn&apos;t supported in this browser — your audio is still recorded for your mentor.</p>
            )}

            {cannot ? (
              <div className="mt-6">
                <p className="text-sm text-slate-500">{submittedBefore ? 'You&apos;ve already completed this interview.' : 'This interview isn&apos;t available.'}</p>
                <button onClick={() => router.push(`/mentee/tasks/${taskId}`)} className="mt-4 px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm">Back to task</button>
              </div>
            ) : (
              <button onClick={begin} className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">
                {resuming ? <><RotateCcw className="w-4 h-4" /> Resume interview</> : <><Play className="w-4 h-4" /> Start interview</>}
              </button>
            )}
          </div>
        </div>
      </Centered>
    );
  }

  // ── Active question ──────────────────────────────────────────────────────────
  const KindIcon = q?.kind === 'code' ? Code2 : q?.kind === 'text' ? Type : Mic;
  const isLast = idx === questions.length - 1;

  return (
    <div className="fixed inset-0 bg-canvas flex flex-col">
      {/* Top bar: progress + timer + camera */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-200 bg-card">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1.5">
            <KindIcon className="w-4 h-4 text-brand-600" />
            Question {idx + 1} of {questions.length}
            <span className="ml-1 text-slate-400">· {q?.points} pts</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${((idx) / questions.length) * 100}%` }} />
          </div>
        </div>
        {data?.options.timingMode === 'total' && totalRemaining !== null ? (
          <div title="Time left for the whole interview" className={`text-sm font-semibold tabular-nums px-3 py-1.5 rounded-lg ${totalRemaining <= 30 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
            {fmtClock(totalRemaining)} left
          </div>
        ) : remaining !== null ? (
          <div className={`text-sm font-semibold tabular-nums px-3 py-1.5 rounded-lg ${remaining <= 10 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
            {fmtClock(remaining)}
          </div>
        ) : null}
        <div
          title={`Proctored${proctor.focusLosses ? ` · left the tab ${proctor.focusLosses}×` : ''}`}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg ${proctor.focusLosses ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
        >
          <Eye className="w-3.5 h-3.5" />Proctored{proctor.focusLosses > 0 && <span className="tabular-nums">· {proctor.focusLosses}</span>}
        </div>
        {data?.options.cameraRequired && (
          <video ref={videoRef} muted playsInline className="w-24 h-16 rounded-lg object-cover bg-slate-900" />
        )}
      </div>

      {/* Fullscreen nudge — appears if they leave fullscreen mid-interview */}
      {!proctor.isFullscreen && (
        <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
          <span className="inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4" />You left fullscreen. This is noted for your mentor.</span>
          <button onClick={() => proctor.requestFullscreen()} className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium">
            <Maximize2 className="w-3.5 h-3.5" />Return to fullscreen
          </button>
        </div>
      )}

      {/* Question + answer */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-start gap-3 mb-6">
            <button onClick={() => q && speak(q.prompt)} title="Replay question" className="shrink-0 w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center hover:bg-brand-100">
              <Volume2 className="w-5 h-5" />
            </button>
            <h1 className="text-lg sm:text-xl font-medium text-slate-900 leading-relaxed">{q?.prompt}</h1>
          </div>

          {/* Answer surface by kind */}
          {q?.kind === 'voice' && (
            <div className="rounded-2xl border border-slate-200 bg-card p-6">
              <div className="flex flex-col items-center">
                <button
                  onClick={toggleRecording}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${recording ? 'bg-red-500 animate-pulse text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
                >
                  {recording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </button>
                <p className="text-sm text-slate-500 mt-3">{recording ? 'Recording — tap to stop' : draft?.audioBlob ? 'Recorded · tap to re-record' : 'Tap to answer by voice'}</p>
                {!recorderSupported() && <p className="text-xs text-amber-600 mt-1">Recording isn&apos;t supported here — type your answer below.</p>}
              </div>
              <div className="mt-5">
                <label className="block text-xs font-medium text-slate-500 mb-1">Transcript {recognitionSupported() && <span className="text-slate-400">(auto — edit if needed)</span>}</label>
                <textarea
                  value={draft?.transcript || ''}
                  onChange={(e) => q && queueSave(q.id, { transcript: e.target.value })}
                  rows={5}
                  placeholder="Your spoken answer appears here…"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}

          {q?.kind === 'code' && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-slate-300 text-xs">
                <span className="inline-flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" />{q.codeLanguage || 'code'}</span>
                <span className="text-slate-500">Autosaved</span>
              </div>
              <textarea
                value={draft?.code || ''}
                onChange={(e) => q && queueSave(q.id, { code: e.target.value })}
                onPaste={(e) => { e.preventDefault(); proctor.log('paste_blocked', { field: 'code' }); toast.message('Pasting is disabled during the interview.'); }}
                spellCheck={false}
                rows={16}
                placeholder="// write your solution here"
                className="w-full bg-slate-950 text-slate-100 font-mono text-sm px-4 py-3 focus:outline-none resize-none"
              />
            </div>
          )}

          {q?.kind === 'text' && (
            <textarea
              value={draft?.answerText || ''}
              onChange={(e) => q && queueSave(q.id, { answerText: e.target.value })}
              rows={10}
              placeholder="Type your answer…"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
        </div>
      </div>

      {/* Footer: advance */}
      <div className="px-6 py-4 border-t border-slate-200 bg-card flex items-center justify-between">
        <p className="text-xs text-slate-400">{recording ? 'Stop recording before moving on.' : 'You can’t return to this question after moving on.'}</p>
        <button
          onClick={() => advance(false)}
          disabled={advancing || phase === 'submitting'}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium disabled:opacity-50"
        >
          {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : isLast ? <CheckCircle2 className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          {isLast ? 'Finish interview' : 'Next question'}
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-canvas flex items-center justify-center p-6">{children}</div>;
}
