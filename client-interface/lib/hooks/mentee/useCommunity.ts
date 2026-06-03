import { useCallback, useEffect, useState } from 'react';
import { communityApi } from '@/lib/services/community-api';

export interface CommunityPost {
  id: string;
  type: 'kudos' | 'win' | 'question' | 'meme';
  body: string;
  at: string;
  author: { id: string; name: string; avatar: string };
  recipient: { id: string; name: string } | null;
  reactions: { cheers: number; helpful: number };
  myReactions: string[];
}

export interface CommunityStats { given: number; cheersReceived: number; posts: number }
export interface CommunityPerson { id: string; name: string }

export interface UseCommunityReturn {
  feed: CommunityPost[];
  shoutouts: CommunityPost[];
  stats: CommunityStats | null;
  people: CommunityPerson[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCommunity(): UseCommunityReturn {
  const [feed, setFeed] = useState<CommunityPost[]>([]);
  const [shoutouts, setShoutouts] = useState<CommunityPost[]>([]);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [people, setPeople] = useState<CommunityPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [feedRes, peopleRes] = await Promise.all([communityApi.feed(), communityApi.people()]);
      setFeed(feedRes?.data?.feed ?? []);
      setShoutouts(feedRes?.data?.shoutouts ?? []);
      setStats(feedRes?.data?.stats ?? null);
      setPeople(peopleRes?.data?.people ?? []);
    } catch {
      setError('Failed to load the community feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { feed, shoutouts, stats, people, loading, error, refetch: fetchAll };
}
