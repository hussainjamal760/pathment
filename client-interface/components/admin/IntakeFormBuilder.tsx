'use client';

import { ChevronDown, ChevronUp, Plus, Trash2, UserCheck } from 'lucide-react';

import {
  CUSTOM_FIELD_TYPES,
  PROFILE_FIELD_CATALOG,
  customKeyFromLabel,
  isProfileField,
  type IntakeFieldType,
  type IntakeFormField,
} from '@/lib/config/intakeFields';

const HAS_OPTIONS: IntakeFieldType[] = ['select', 'checkboxes'];

/**
 * Controlled builder for a cohort's application form (`intakeFormSchema`).
 * Name + email are always collected on the apply page; this manages everything
 * else. "Profile" fields (mapped) carry forward to the mentee's profile so they
 * never re-enter it; "custom" questions live in `responses` for triage only.
 */
export function IntakeFormBuilder({
  value,
  onChange,
}: {
  value: IntakeFormField[];
  onChange: (fields: IntakeFormField[]) => void;
}) {
  const fields = value || [];
  const usedProfileKeys = new Set(fields.filter((f) => isProfileField(f.key)).map((f) => f.key));
  const availableProfile = PROFILE_FIELD_CATALOG.filter((p) => !usedProfileKeys.has(p.key));

  const patch = (idx: number, p: Partial<IntakeFormField>) =>
    onChange(fields.map((f, i) => (i === idx ? { ...f, ...p } : f)));
  const remove = (idx: number) => onChange(fields.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const addProfile = (key: string) => {
    const def = PROFILE_FIELD_CATALOG.find((p) => p.key === key);
    if (!def) return;
    onChange([...fields, { key: def.key, label: def.label, type: def.type, required: false, options: def.options, profileKey: def.key }]);
  };
  const addCustom = (type: IntakeFieldType) => {
    const key = customKeyFromLabel('question', fields.map((f) => f.key));
    onChange([...fields, { key, label: '', type, required: false, options: HAS_OPTIONS.includes(type) ? ['Option 1'] : undefined }]);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Name and email are always collected. Add anything else here — <span className="text-brand-700 font-medium">profile fields</span> carry
        straight to the mentee&apos;s profile (no re-typing later); custom questions are kept for your review.
      </p>

      {fields.length === 0 && (
        <p className="text-sm text-slate-400 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
          No extra fields yet. Add profile fields or custom questions below.
        </p>
      )}

      {fields.map((f, idx) => {
        const mapped = isProfileField(f.key);
        return (
          <div key={f.key} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === fields.length - 1} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
              <input
                value={f.label}
                onChange={(e) => patch(idx, { label: e.target.value, key: mapped ? f.key : customKeyFromLabel(e.target.value, fields.filter((_, i) => i !== idx).map((x) => x.key)) })}
                placeholder="Question / field label"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
              />
              {mapped ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 bg-brand-50 dark:bg-brand-500/15 rounded-full px-2 py-1 shrink-0"><UserCheck className="w-3 h-3" /> profile</span>
              ) : (
                <span className="text-[11px] text-slate-400 shrink-0 capitalize">{f.type.replace('_', '/')}</span>
              )}
              <label className="inline-flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <input type="checkbox" checked={!!f.required} onChange={(e) => patch(idx, { required: e.target.checked })} className="accent-brand-600" /> req
              </label>
              <button type="button" onClick={() => remove(idx)} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>

            {HAS_OPTIONS.includes(f.type) && (
              <div className="mt-2 ml-7">
                <input
                  value={(f.options || []).join(', ')}
                  onChange={(e) => patch(idx, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Options, comma-separated"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 pt-1">
        {availableProfile.length > 0 && (
          <details className="relative">
            <summary className="list-none cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50/40">
              <Plus className="w-3.5 h-3.5" /> Profile field
            </summary>
            <div className="absolute z-10 mt-1 w-56 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-card shadow-lg p-1">
              {availableProfile.map((p) => (
                <button key={p.key} type="button" onClick={() => addProfile(p.key)} className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">{p.label}</button>
              ))}
            </div>
          </details>
        )}
        <details className="relative">
          <summary className="list-none cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50/40">
            <Plus className="w-3.5 h-3.5" /> Custom question
          </summary>
          <div className="absolute z-10 mt-1 w-48 rounded-xl border border-slate-200 bg-card shadow-lg p-1">
            {CUSTOM_FIELD_TYPES.map((t) => (
              <button key={t.type} type="button" onClick={() => addCustom(t.type)} className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">{t.label}</button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
