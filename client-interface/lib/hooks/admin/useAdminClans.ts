'use client';

import { useState, useEffect } from 'react';
import { qk, useApiQuery } from '@/lib/query';
import { clanApi } from '@/lib/services/clan-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';

export interface ClanMembershipRow {
  id: string;
  userId: string;
  role: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team';
  status: string;
  user?: { id: string; firstName: string; lastName: string; email: string; role: string; profilePictureUrl?: string | null };
}

export interface Clan {
  id: string;
  name: string;
  description?: string;
  whatsappGroupLink?: string | null;
  status: string;
  tags: string[];
  levelLabel?: string | null;
  /** Cohort level keys this clan serves (empty = any level). */
  levels?: string[];
  /** Countries this clan serves (empty = any country). */
  countries?: string[];
  maxMentees: number;
  programId: string;
  program?: { id: string; name: string };
  leadMentor?: { id: string; firstName: string; lastName: string } | null;
  memberships?: ClanMembershipRow[];
  /** Active-member counts from the paginated list endpoint. */
  menteeCount?: number;
  mentorCount?: number;
}

export interface UseAdminClansReturn {
  clans: Clan[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  pagination: ReturnType<typeof usePagination>;
  search: string;
  setSearch: (v: string) => void;
  programFilter: string;
  setProgramFilter: (v: string) => void;
}

/**
 * Server-side clan list for the admin page: search (name/program/lead-mentor/tag)
 * + program filter + pagination, all enforced (and capped) on the backend so the
 * full table is never shipped to the browser. Grows safely with the org.
 */
interface ClanPage { clans: Clan[]; total: number | null }

const EMPTY: ClanPage = { clans: [], total: null };

export function useAdminClans(): UseAdminClansReturn {
  const pagination = usePagination({ initialPage: 1, initialLimit: 12 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [programFilter, setProgramFilter] = useState('');

  const { data, loading, error, refetch } = useApiQuery<ClanPage>({
    queryKey: qk.admin.clanList(pagination.page, pagination.limit, debouncedSearch.trim(), programFilter),
    queryFn: async () => {
      const res = await clanApi.list({
        page: pagination.page,
        limit: pagination.limit,
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        ...(programFilter && { programId: programFilter }),
      });
      return { clans: res?.data?.clans ?? [], total: res?.data?.total ?? null };
    },
    errorMessage: 'Failed to load clans',
  });

  // The page total belongs to the pagination helper, not the query, so it is
  // synced here rather than written from inside queryFn.
  const total = data?.total ?? null;
  useEffect(() => {
    if (typeof total === 'number') pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Any filter change returns to page 1.
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, programFilter]);

  return {
    clans: data?.clans ?? EMPTY.clans,
    loading, error, refetch, pagination, search, setSearch, programFilter, setProgramFilter,
  };
}
