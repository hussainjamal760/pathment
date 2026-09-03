'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { certificatesApi } from '@/lib/services/certificates-api';
import { TierCriteria } from '../certificate-constants';


interface UseTierModalOptions {
  criteria: TierCriteria[];
  setCriteria: React.Dispatch<React.SetStateAction<TierCriteria[]>>;
}

/**
 * Custom hook for tier criteria creation/editing modal, toggle states,
 * badge uploading, tag keywords input, and save/delete handlers.
 */
export function useTierModal({ criteria, setCriteria }: UseTierModalOptions) {
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<TierCriteria | null>(null);

  // Form input states
  const [tierModalName, setTierModalName] = useState('');
  const [tierModalBadgeUrl, setTierModalBadgeUrl] = useState('');
  const [tierModalKeywords, setTierModalKeywords] = useState<string[]>([]);
  const [tierModalKeywordInput, setTierModalKeywordInput] = useState('');
  const [tierModalMinScore, setTierModalMinScore] = useState(75);
  const [tierModalMaxBlockers, setTierModalMaxBlockers] = useState(0);
  const [tierModalMinCompletion, setTierModalMinCompletion] = useState(80);
  const [tierModalMinOnTime, setTierModalMinOnTime] = useState(80);
  const [tierModalMinRating, setTierModalMinRating] = useState(4.0);
  const [tierModalCustomRule, setTierModalCustomRule] = useState('');
  const [uploadingTierBadge, setUploadingTierBadge] = useState(false);

  // Toggle states for enabling/disabling individual criteria checks
  const [enableKeywords, setEnableKeywords] = useState(true);
  const [enableMinScore, setEnableMinScore] = useState(true);
  const [enableMaxBlockers, setEnableMaxBlockers] = useState(true);
  const [enableMinCompletion, setEnableMinCompletion] = useState(true);
  const [enableMinOnTime, setEnableMinOnTime] = useState(true);
  const [enableMinRating, setEnableMinRating] = useState(true);
  const [enableCustomRule, setEnableCustomRule] = useState(true);

  // Open Add/Edit Tier dialog
  const openTierModal = (tier?: TierCriteria) => {
    if (tier) {
      setEditingTier(tier);
      setTierModalName(tier.name);
      setTierModalBadgeUrl(tier.badgeUrl || '');

      setEnableKeywords(Array.isArray(tier.keywords) && tier.keywords.length > 0);
      setEnableMinScore(tier.minScorePercent != null);
      setEnableMaxBlockers(tier.maxOpenBlockers != null);
      setEnableMinCompletion(tier.minCompletionRate != null);
      setEnableMinOnTime(tier.minOnTimeRate != null);
      setEnableMinRating(tier.minAvgRating != null);
      setEnableCustomRule(Boolean(tier.customRule && tier.customRule.trim()));

      setTierModalKeywords(tier.keywords || []);
      setTierModalMinScore(tier.minScorePercent ?? 75);
      setTierModalMaxBlockers(tier.maxOpenBlockers ?? 0);
      setTierModalMinCompletion(tier.minCompletionRate ?? 80);
      setTierModalMinOnTime(tier.minOnTimeRate ?? 80);
      setTierModalMinRating(tier.minAvgRating ?? 4.0);
      setTierModalCustomRule(tier.customRule ?? '');
    } else {
      setEditingTier(null);
      setTierModalName('');
      setTierModalBadgeUrl('');

      setEnableKeywords(true);
      setEnableMinScore(true);
      setEnableMaxBlockers(true);
      setEnableMinCompletion(true);
      setEnableMinOnTime(true);
      setEnableMinRating(true);
      setEnableCustomRule(true);

      setTierModalKeywords([]);
      setTierModalMinScore(75);
      setTierModalMaxBlockers(0);
      setTierModalMinCompletion(80);
      setTierModalMinOnTime(80);
      setTierModalMinRating(4.0);
      setTierModalCustomRule('');
    }
    setTierModalKeywordInput('');
    setIsTierModalOpen(true);
  };

  const handleTierBadgeUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingTierBadge(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setTierModalBadgeUrl(res.url);
        toast.success('Badge icon uploaded successfully!');
      }
    } catch (err) {
      toast.error('Failed to upload badge icon');
    } finally {
      setUploadingTierBadge(false);
    }
  };

  const saveTierModal = () => {
    if (!tierModalName.trim()) {
      toast.error('Tier name is required');
      return;
    }

    // Flush any pending keyword input
    const kws = [...tierModalKeywords];
    const pending = tierModalKeywordInput.trim();
    if (pending && !kws.includes(pending)) kws.push(pending);

    const newFields = {
      name:              tierModalName.trim(),
      badgeUrl:          tierModalBadgeUrl,
      keywords:          enableKeywords ? kws : null,
      minScorePercent:   enableMinScore ? tierModalMinScore : null,
      maxOpenBlockers:   enableMaxBlockers ? tierModalMaxBlockers : null,
      minCompletionRate: enableMinCompletion ? tierModalMinCompletion : null,
      minOnTimeRate:     enableMinOnTime ? tierModalMinOnTime : null,
      minAvgRating:      enableMinRating ? tierModalMinRating : null,
      customRule:        enableCustomRule ? tierModalCustomRule.trim() : null,
    };

    setCriteria(prev => {
      if (editingTier) {
        return prev.map(t => t.id === editingTier.id
          ? { ...t, ...newFields }
          : t
        );
      } else {
        const newTier: TierCriteria = {
          id: `tier-${Date.now()}`,
          ...newFields,
        };
        return [...prev, newTier];
      }
    });

    setIsTierModalOpen(false);
    toast.success(editingTier ? 'Certificate type updated' : 'Certificate type added');
  };

  const deleteTier = (tierId: string) => {
    if (criteria.length <= 1) {
      toast.error('Template must have at least one certificate type');
      return;
    }
    setCriteria(prev => prev.filter(t => t.id !== tierId));
    toast.success('Certificate type deleted');
  };

  return {
    isTierModalOpen,
    setIsTierModalOpen,
    editingTier,
    openTierModal,
    saveTierModal,
    deleteTier,
    handleTierBadgeUpload,
    uploadingTierBadge,
    // Inputs & Setters
    tierModalName, setTierModalName,
    tierModalBadgeUrl, setTierModalBadgeUrl,
    tierModalKeywords, setTierModalKeywords,
    tierModalKeywordInput, setTierModalKeywordInput,
    tierModalMinScore, setTierModalMinScore,
    tierModalMaxBlockers, setTierModalMaxBlockers,
    tierModalMinCompletion, setTierModalMinCompletion,
    tierModalMinOnTime, setTierModalMinOnTime,
    tierModalMinRating, setTierModalMinRating,
    tierModalCustomRule, setTierModalCustomRule,
    // Toggles & Setters
    enableKeywords, setEnableKeywords,
    enableMinScore, setEnableMinScore,
    enableMaxBlockers, setEnableMaxBlockers,
    enableMinCompletion, setEnableMinCompletion,
    enableMinOnTime, setEnableMinOnTime,
    enableMinRating, setEnableMinRating,
    enableCustomRule, setEnableCustomRule
  };
}
