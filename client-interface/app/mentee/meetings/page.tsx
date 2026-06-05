'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Clock, Loader2, X, Check, CalendarPlus, CalendarX2, MessageSquareText } from 'lucide-react';
import { useMenteeMeetings, type OpenSlot, type MenteeMeeting } from '@/lib/hooks/mentee';
import { meetingsApi } from '@/lib/services/meetings-api';
import { Drawer } from '@/components/shared/Drawer';

const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const STATUS_CLASS: Record<string, string> = {
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function MenteeMeetings() {
  const { bookable, meetings, loading, error, refetch } = useMenteeMeetings();
  const [booking, setBooking] = useState<OpenSlot | null>(null);
  const [bookingMentor, setBookingMentor] = useState<string>('');
  const [agenda, setAgenda] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelFor, setCancelFor] = useState<MenteeMeeting | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const confirmBook = async () => {
    if (!booking) return;
    try {
      setSaving(true);
      await meetingsApi.book(booking.id, agenda.trim() || undefined);
      toast.success('1:1 booked — see you there!');
      setBooking(null);
      setAgenda('');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not book that slot');
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelFor) return;
    try {
      setBusyId(cancelFor.id);
      await meetingsApi.updateStatus(cancelFor.id, 'cancelled');
      toast.success('Meeting cancelled');
      setCancelFor(null);
      refetch();
    } catch {
      toast.error('Could not cancel');
    } finally {
      setBusyId(null);
    }
  };

  const upcoming = meetings.filter((m) => m.status === 'scheduled');
  const past = meetings.filter((m) => m.status !== 'scheduled');
  const next = upcoming[0] || null;
  const laterUpcoming = upcoming.slice(1);
  const totalOpenSlots = bookable.reduce((n, b) => n + b.slots.length, 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-1">1:1s with your mentor</h1>
        <p className="text-slate-600">Grab a time that works for you — pick a slot and you&apos;re booked.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {/* Next 1:1 — the one thing that matters most */}
          {next && (
            <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-600 flex flex-col items-center justify-center text-white shrink-0">
                  <CalendarClock className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Your next 1:1</p>
                  <p className="text-base font-semibold text-slate-900 mt-0.5">{next.day} · {next.time}</p>
                  <p className="text-sm text-slate-500">
                    With {next.mentor?.firstName} {next.mentor?.lastName} · {next.durationMins} min
                  </p>
                  {next.agenda && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                      <MessageSquareText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />{next.agenda}
                    </p>
                  )}
                </div>
                <button onClick={() => setCancelFor(next)} disabled={busyId === next.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-white hover:text-red-600 transition-colors shrink-0 disabled:opacity-50">
                  {busyId === next.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}Cancel
                </button>
              </div>
            </div>
          )}

          {/* Book a 1:1 — mentor card with slots grouped by day */}
          <section className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-slate-900 flex items-center gap-2"><CalendarPlus className="w-4 h-4 text-brand-500" />Book a 1:1</h2>
              {totalOpenSlots > 0 && <span className="text-xs text-slate-400">{totalOpenSlots} open time{totalOpenSlots === 1 ? '' : 's'}</span>}
            </div>
            <div className="p-6 space-y-6">
              {bookable.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3"><CalendarClock className="w-6 h-6 text-slate-300" /></div>
                  <p className="text-sm text-slate-500">No mentor assigned yet — once you&apos;re placed in a clan, your mentor shows up here.</p>
                </div>
              ) : (
                bookable.map((b) => {
                  const byDay = b.slots.reduce<Record<string, OpenSlot[]>>((acc, s) => {
                    (acc[s.day] ||= []).push(s);
                    return acc;
                  }, {});
                  return (
                    <div key={b.mentor.id}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-sm font-semibold">{initialsOf(b.mentor.name)}</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{b.mentor.name}</h3>
                          <p className="text-xs text-slate-400">Your mentor</p>
                        </div>
                      </div>

                      {b.slots.length === 0 ? (
                        <p className="text-sm text-slate-400 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
                          No open times right now — message your mentor to set some up.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(byDay).map(([day, slots]) => (
                            <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <span className="w-32 shrink-0 text-xs font-medium text-slate-500">{day}</span>
                              <div className="flex flex-wrap gap-2">
                                {slots.map((s) => (
                                  <button key={s.id} onClick={() => { setBooking(s); setBookingMentor(b.mentor.name); setAgenda(''); }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 transition-colors">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />{s.time}
                                    <span className="text-slate-400">· {s.durationMins}m</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* More upcoming */}
          {laterUpcoming.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100"><h2 className="text-slate-900">More upcoming</h2></div>
              <div className="divide-y divide-slate-100">
                {laterUpcoming.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-6 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0"><CalendarClock className="w-4 h-4 text-brand-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{m.day} · {m.time}</p>
                      <p className="text-xs text-slate-500">With {m.mentor?.firstName} · {m.durationMins}m{m.agenda ? ` · ${m.agenda}` : ''}</p>
                    </div>
                    <button onClick={() => setCancelFor(m)} disabled={busyId === m.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50 shrink-0">
                      {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}Cancel
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100"><h2 className="text-slate-900">Past 1:1s</h2></div>
              <div className="divide-y divide-slate-100">
                {past.map((m) => {
                  const cancelledByMentor = m.status === 'cancelled' && !!m.cancelledBy && m.cancelledBy === m.mentor?.id;
                  return (
                    <div key={m.id} className="px-6 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.status === 'done' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                            {m.status === 'done' ? <Check className="w-4 h-4 text-emerald-600" /> : <CalendarX2 className="w-4 h-4 text-slate-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700 truncate">{m.day} · {m.time}</p>
                            <p className="text-xs text-slate-400">With {m.mentor?.firstName}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs capitalize shrink-0 ${STATUS_CLASS[m.status] || 'bg-slate-100 text-slate-500'}`}>{m.status}</span>
                      </div>
                      {m.status === 'cancelled' && (cancelledByMentor || m.cancellationReason) && (
                        <div className="mt-2 ml-10 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
                          {cancelledByMentor && <span className="font-medium text-slate-700">Cancelled by your mentor. </span>}
                          {m.cancellationReason || (cancelledByMentor ? 'No reason given.' : null)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Booking confirm drawer */}
      <Drawer
        open={!!booking}
        onClose={() => setBooking(null)}
        title="Confirm your 1:1"
        subtitle={booking ? `${bookingMentor} · ${booking.day} · ${booking.time} (${booking.durationMins} min)` : undefined}
        width="sm"
        footer={
          <>
            <button onClick={() => setBooking(null)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Back</button>
            <button onClick={confirmBook} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Confirm booking
            </button>
          </>
        }
      >
        <label className="block text-sm font-medium text-slate-700 mb-1.5">What would you like to cover? <span className="text-slate-400 font-normal">(optional)</span></label>
        <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={4}
          placeholder="e.g. I'm stuck on the JWT refresh flow and want to review my approach"
          className="w-full border border-slate-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
        <p className="mt-2 text-xs text-slate-400">Sharing an agenda helps your mentor prepare and makes the most of your time.</p>
      </Drawer>

      {/* Cancel confirm drawer */}
      <Drawer
        open={!!cancelFor}
        onClose={() => setCancelFor(null)}
        title="Cancel this 1:1?"
        subtitle={cancelFor ? `${cancelFor.day} · ${cancelFor.time} with ${cancelFor.mentor?.firstName ?? 'your mentor'}` : undefined}
        width="sm"
        footer={
          <>
            <button onClick={() => setCancelFor(null)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Keep it</button>
            <button onClick={confirmCancel} disabled={busyId === cancelFor?.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {busyId === cancelFor?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}Cancel 1:1
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This frees the slot so you (or another mentee) can book it again. Your mentor will be notified.</p>
      </Drawer>
    </div>
  );
}
