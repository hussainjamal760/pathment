import { useCallback, useEffect, useState } from 'react';
import { libraryApi } from '@/lib/services/library-api';

export interface LibraryDoc {
  id: string;
  title: string;
  category: 'guidance' | 'reading' | 'template' | 'policy';
  summary: string | null;
  author: string | null;
  url: string | null;
  readMins: number | null;
  pinned: boolean;
  updatedAt: string;
}

export interface UseLibraryReturn {
  documents: LibraryDoc[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLibrary(): UseLibraryReturn {
  const [documents, setDocuments] = useState<LibraryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await libraryApi.list();
      setDocuments(res?.data?.documents ?? []);
    } catch {
      setError('Failed to load the library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { documents, loading, error, refetch: fetchAll };
}
