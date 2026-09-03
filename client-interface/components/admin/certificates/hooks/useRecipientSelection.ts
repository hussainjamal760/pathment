'use client';

import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { TierCriteria } from '../certificate-constants';

export interface UseRecipientSelectionOptions {
  criteria: TierCriteria[];
  qualifiedData: Record<string, any[]>;
}

export function useRecipientSelection({ criteria, qualifiedData }: UseRecipientSelectionOptions) {
  const [recipientSearch, setRecipientSearch] = useState('');
  const [badgeFilter, setBadgeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'none' | 'score_desc' | 'score_asc'>('none');
  const [recipientType, setRecipientType] = useState<'all' | 'mentees' | 'mentors'>('all');
  const [selectedMenteeIds, setSelectedMenteeIds] = useState<Set<string>>(new Set());
  const [assignedTiers, setAssignedTiers] = useState<Record<string, string>>({});

  // Deriving lists from qualifiedData
  const recipientMenteesList = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    criteria.forEach(c => {
      (qualifiedData[c.id] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee' }); }
      });
    });
    // Pick up any remaining mentees from data keys not covered by current criteria
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee' }); }
      });
    });
    return list;
  }, [criteria, qualifiedData]);

  const recipientMentorsList = useMemo(
    () => (qualifiedData.mentors ?? []).map((m: any) => ({ ...m, role: 'mentor' })),
    [qualifiedData]
  );

  /** Filtered by current Recipient Type tab (All / Mentees / Mentors) */
  const activeList = useMemo(() => {
    if (recipientType === 'all') return [...recipientMenteesList, ...recipientMentorsList];
    if (recipientType === 'mentees') return recipientMenteesList;
    return recipientMentorsList;
  }, [recipientType, recipientMenteesList, recipientMentorsList]);

  /** Further filtered by search field, badge filter, and sorted by score */
  const filtered = useMemo(() => {
    let result = [...activeList];

    // 1. Filter by search query
    const q = recipientSearch.toLowerCase().trim();
    if (q) {
      result = result.filter((m: any) =>
        `${m.firstName || ''} ${m.lastName || ''} ${m.email || ''}`.toLowerCase().includes(q)
      );
    }

    // 2. Filter by assigned badge (tier)
    if (badgeFilter !== 'all') {
      const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
      result = result.filter((m: any) => {
        const tier = assignedTiers[m.id] ?? defaultTier;
        return tier === badgeFilter;
      });
    }

    // 3. Sort by score
    if (sortBy === 'score_desc') {
      result.sort((a: any, b: any) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0));
    } else if (sortBy === 'score_asc') {
      result.sort((a: any, b: any) => (a.normalizedScore ?? 0) - (b.normalizedScore ?? 0));
    }

    return result;
  }, [activeList, recipientSearch, badgeFilter, sortBy, assignedTiers, criteria]);

  const allFilteredIds = useMemo(() => filtered.map((m: any) => m.id), [filtered]);

  const allSelected = useMemo(
    () => allFilteredIds.length > 0 && allFilteredIds.every(id => selectedMenteeIds.has(id)),
    [allFilteredIds, selectedMenteeIds]
  );

  const selectedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    criteria.forEach(c => { summary[c.id] = 0; });
    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    selectedMenteeIds.forEach(id => {
      const tier = assignedTiers[id] ?? defaultTier;
      summary[tier] = (summary[tier] ?? 0) + 1;
    });
    return summary;
  }, [criteria, selectedMenteeIds, assignedTiers]);

  const toggleAll = useCallback(() => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allFilteredIds.forEach(id => next.delete(id));
      } else {
        allFilteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [allSelected, allFilteredIds]);

  const toggleOne = useCallback((id: string) => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTierChange = useCallback((menteeId: string, value: string) => {
    setAssignedTiers(prev => ({ ...prev, [menteeId]: value }));
    const mentee = activeList.find((m: any) => m.id === menteeId);
    if (mentee) {
      const match = (mentee as any).tierMatches?.[value] ?? 0;
      setSelectedMenteeIds(prev => {
        const next = new Set(prev);
        if (match >= 90) next.add(menteeId);
        else next.delete(menteeId);
        return next;
      });
    }
  }, [activeList]);

  const bulkSetBadge = useCallback((badge: string, getTierNameFn?: (b: string) => string) => {
    const updatedTiers = { ...assignedTiers };
    const nextSelected = new Set(selectedMenteeIds);
    filtered.forEach((m: any) => {
      updatedTiers[m.id] = badge;
      const match = m.tierMatches?.[badge] ?? 0;
      if (match >= 90) nextSelected.add(m.id);
      else nextSelected.delete(m.id);
    });
    setAssignedTiers(updatedTiers);
    setSelectedMenteeIds(nextSelected);
    const tierName = getTierNameFn ? getTierNameFn(badge) : badge;
    toast.info(`Set all filtered recipients to ${tierName}`);
  }, [assignedTiers, selectedMenteeIds, filtered]);

  const resetToAIRecommendations = useCallback((aiResults: any[]) => {
    if (!aiResults || aiResults.length === 0) return;
    const updatedTiers = { ...assignedTiers };
    const nextSelected = new Set(selectedMenteeIds);
    const aiMap: Record<string, string> = {};

    aiResults.forEach(r => {
      if (r.mentee_id && r.certificate_tier) {
        aiMap[r.mentee_id] = r.certificate_tier;
      }
    });

    filtered.forEach((m: any) => {
      const aiTier = aiMap[m.id];
      if (aiTier) {
        updatedTiers[m.id] = aiTier;
        const match = m.tierMatches?.[aiTier] ?? 0;
        if (match >= 90) nextSelected.add(m.id);
        else nextSelected.delete(m.id);
      }
    });

    setAssignedTiers(updatedTiers);
    setSelectedMenteeIds(nextSelected);
    toast.success('Reset all filtered recipients to AI recommendations.');
  }, [assignedTiers, selectedMenteeIds, filtered]);

  return {
    recipientSearch,
    setRecipientSearch,
    badgeFilter,
    setBadgeFilter,
    sortBy,
    setSortBy,
    recipientType,
    setRecipientType,
    selectedMenteeIds,
    setSelectedMenteeIds,
    assignedTiers,
    setAssignedTiers,
    recipientMenteesList,
    recipientMentorsList,
    activeList,
    filtered,
    allFilteredIds,
    allSelected,
    selectedSummary,
    toggleAll,
    toggleOne,
    handleTierChange,
    bulkSetBadge,
    resetToAIRecommendations,
  };
}
