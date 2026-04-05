'use client';

import {
  Clock,
  AlertCircle,
  MessageSquare
} from 'lucide-react';
import { PageHeader, StatsCard, SearchAndFilterBar } from '@/components/admin/ui';
import { LoadingSpinner, ErrorState, SubmissionCard } from '@/components/shared';
import { useSubmissionReview } from '@/lib/hooks/mentor/useSubmissionReview';

export default function ReviewQueue() {
  // Custom hook for submission review logic
  const {
    filteredSubmissions,
    isLoading,
    error,
    filterStatus,
    setFilterStatus,
    searchTerm,
    setSearchTerm,
    submissions,
  } = useSubmissionReview();

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner variant="page" message="Loading submissions..." />;
  }

  // Show error state
  if (error) {
    return <ErrorState variant="page" message={error} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Review Queue"
        subtitle="Review and provide feedback on mentee submissions"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatsCard icon={Clock}        label="Pending Reviews"  value={submissions.length}                                                      colorClass="text-yellow-600 bg-yellow-100" />
        <StatsCard icon={AlertCircle}  label="High Priority"    value={submissions.filter(s => s.priority === 'high').length}                  colorClass="text-red-600 bg-red-100" />
        <StatsCard icon={Clock}        label="Avg. Review Time" value="18h"                                                                     colorClass="text-blue-600 bg-blue-100" />
      </div>

      {/* Filters */}
      <SearchAndFilterBar
        search={searchTerm}
        onSearch={setSearchTerm}
        placeholder="Search submissions..."
        filters={[
          {
            value: filterStatus,
            onChange: setFilterStatus,
            options: [
              { value: 'all', label: 'All Submissions' },
              { value: 'high', label: 'High Priority' },
              { value: 'medium', label: 'Medium Priority' },
              { value: 'low', label: 'Low Priority' },
            ],
          },
        ]}
      />

      {/* Submissions List */}
      <div className="space-y-4">
        {filteredSubmissions.map((submission) => (
          <SubmissionCard
            key={submission.id}
            id={submission.id}
            mentee={submission.mentee}
            task={submission.task}
            program={submission.program}
            submittedDate={submission.submittedDate}
            hoursAgo={submission.hoursAgo}
            priority={submission.priority}
            hasFiles={submission.hasFiles}
            hasLinks={submission.hasLinks}
            description={submission.description}
            reviewHref={`/mentor/tasks/${submission.id}/feedback`}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredSubmissions.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-slate-900 mb-2">No submissions to review</h3>
          <p className="text-slate-600 text-sm">
            {searchTerm || filterStatus !== 'all' 
              ? 'No submissions match your filters' 
              : 'All caught up! Check back later for new submissions.'}
          </p>
        </div>
      )}
    </div>
  );
}
