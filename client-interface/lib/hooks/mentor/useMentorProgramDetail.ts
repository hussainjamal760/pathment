/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { clanApi } from '@/lib/services/clan-api';

export interface ProgramPerson {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatar: string;
}

export interface ProgramClanDetail {
  id: string;
  name: string;
  myRole: 'lead_mentor' | 'co_mentor';
  mentees: ProgramPerson[];
  coMentors: ProgramPerson[];
}

export interface MentorProgramInfo {
  id: string;
  name: string;
  status: string | null;
  visibility: string | null;
  description: string | null;
}

export interface UseMentorProgramDetailReturn {
  program: MentorProgramInfo | null;
  clans: ProgramClanDetail[];
  menteeCount: number;
  coMentorCount: number;
  loading: boolean;
  notFound: boolean;
  refetch: () => Promise<void>;
}

const fullName = (u: any) => `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || u?.email || 'Member';
const initials = (u: any) => `${(u?.firstName || '')[0] || ''}${(u?.lastName || '')[0] || ''}`.toUpperCase() || '?';

/**
 * Mentor program detail, built only from what the mentor can actually access:
 * the clans they lead/co-mentor in the program (via /clans/mentor/programs) and
 * each clan's members (via /clans/:id). No deprecated levels / week-roadmaps and
 * no private-program fetch that mentors aren't allowed to read.
 */
export function useMentorProgramDetail(programId: string): UseMentorProgramDetailReturn {
  const [program, setProgram] = useState<MentorProgramInfo | null>(null);
  const [clans, setClans] = useState<ProgramClanDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!programId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res: any = await clanApi.mentorPrograms();
      const progs: any[] = res?.data?.programs ?? [];
      const p = progs.find((x) => x.id === programId);
      if (!p) { setProgram(null); setClans([]); setNotFound(true); return; }

      setProgram({ id: p.id, name: p.name, status: p.status ?? null, visibility: p.visibility ?? null, description: p.description ?? null });

      const detailed = await Promise.all((p.clans || []).map(async (c: any): Promise<ProgramClanDetail> => {
        try {
          const cr: any = await clanApi.get(c.id);
          const memberships: any[] = cr?.data?.clan?.memberships ?? [];
          const mentees: ProgramPerson[] = [];
          const coMentors: ProgramPerson[] = [];
          memberships.forEach((m) => {
            if (!m.user) return;
            const person: ProgramPerson = { id: m.user.id, name: fullName(m.user), email: m.user.email, role: m.role, avatar: initials(m.user) };
            if (m.role === 'mentee') mentees.push(person);
            else coMentors.push(person);
          });
          return { id: c.id, name: c.name, myRole: c.myRole, mentees, coMentors };
        } catch {
          return { id: c.id, name: c.name, myRole: c.myRole, mentees: [], coMentors: [] };
        }
      }));
      setClans(detailed);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const menteeCount = clans.reduce((n, c) => n + c.mentees.length, 0);
  const coMentorCount = clans.reduce((n, c) => n + c.coMentors.length, 0);

  return { program, clans, menteeCount, coMentorCount, loading, notFound, refetch: fetchDetail };
}
