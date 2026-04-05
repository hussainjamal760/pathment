'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export interface Submission {
  id: number;
  mentee: string;
  menteeId: string;
  task: string;
  taskId: string;
  program: string;
  submittedDate: string;
  hoursAgo: number;
  priority: 'low' | 'medium' | 'high';
  hasFiles: boolean;
  hasLinks: boolean;
  description: string;
  links?: string[];
  files?: string[];
}

interface UseSubmissionReviewReturn {
  submissions: Submission[];
  isLoading: boolean;
  error: string | null;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredSubmissions: Submission[];
  refetch: () => void;
}

export function useSubmissionReview(): UseSubmissionReviewReturn {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks/submissions/pending`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch submissions');
      }

      const data = await response.json();
      
      // Transform API data to match our interface
      const transformedSubmissions = data.map((item: any) => ({
        id: item.id,
        mentee: item.mentee?.name || 'Unknown',
        menteeId: item.mentee?.id || '',
        task: item.task?.title || 'Unknown Task',
        taskId: item.task?.id || '',
        program: item.task?.program?.name || 'Unknown Program',
        submittedDate: new Date(item.submittedAt).toISOString().split('T')[0],
        hoursAgo: Math.floor((Date.now() - new Date(item.submittedAt).getTime()) / (1000 * 60 * 60)),
        priority: item.task?.priority || 'medium',
        hasFiles: (item.files?.length || 0) > 0,
        hasLinks: (item.links?.length || 0) > 0,
        description: item.description || '',
        links: item.links || [],
        files: item.files || [],
      }));

      setSubmissions(transformedSubmissions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load submissions';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  // Filter submissions based on search and filter
  const filteredSubmissions = submissions.filter((submission) => {
    const matchesSearch = searchTerm === '' || 
      submission.mentee.toLowerCase().includes(searchTerm.toLowerCase()) ||
      submission.task.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || submission.priority === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  return {
    submissions,
    isLoading,
    error,
    filterStatus,
    setFilterStatus,
    searchTerm,
    setSearchTerm,
    filteredSubmissions,
    refetch: fetchSubmissions,
  };
}
