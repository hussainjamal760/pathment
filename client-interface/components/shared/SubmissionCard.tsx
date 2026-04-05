/**
 * SubmissionCard - Displays a task submission for mentor review
 * Used in mentor review queue and task detail pages
 */

import Link from 'next/link';
import {
  Clock,
  Calendar,
  User,
  ExternalLink,
  FileText,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';

export interface SubmissionCardProps {
  id: number;
  mentee: string;
  task: string;
  program?: string;
  submittedDate: string;
  hoursAgo: number;
  priority?: 'low' | 'medium' | 'high';
  hasFiles: boolean;
  hasLinks: boolean;
  description: string;
  reviewHref: string;
}

const getUrgencyColor = (hoursAgo: number) => {
  if (hoursAgo > 48) return 'text-red-600 bg-red-50 border-red-200';
  if (hoursAgo > 24) return 'text-orange-600 bg-orange-50 border-orange-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

export function SubmissionCard({
  mentee,
  task,
  program,
  submittedDate,
  hoursAgo,
  priority,
  hasFiles,
  hasLinks,
  description,
  reviewHref,
}: SubmissionCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-slate-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-slate-900 font-medium">{mentee}</h3>
                {priority === 'high' && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                    High Priority
                  </span>
                )}
              </div>
              <p className="text-slate-900 mb-1">{task}</p>
              {program && (
                <p className="text-slate-600 text-sm mb-2">{program}</p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Submitted {submittedDate}
                </span>
                <span className={`px-2 py-1 rounded border text-xs ${getUrgencyColor(hoursAgo)}`}>
                  <Clock className="w-3 h-3 inline mr-1" />
                  {hoursAgo}h ago
                </span>
              </div>
            </div>
          </div>

          {/* Description Preview */}
          <div className="p-4 bg-slate-50 rounded-xl mb-4">
            <p className="text-slate-700 text-sm line-clamp-2">{description}</p>
          </div>

          {/* Attachments */}
          <div className="flex flex-wrap gap-3">
            {hasLinks && (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                <ExternalLink className="w-4 h-4" />
                Project Links
              </div>
            )}
            {hasFiles && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm">
                <FileText className="w-4 h-4" />
                Attachments
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex lg:flex-col gap-2">
          <Link
            href={reviewHref}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors flex items-center gap-2 justify-center whitespace-nowrap"
          >
            <MessageSquare className="w-4 h-4" />
            Review & Feedback
          </Link>
        </div>
      </div>

      {/* Urgency Alert for Old Submissions */}
      {hoursAgo > 48 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-900 text-sm font-medium">
              This submission has been waiting for more than 48 hours
            </p>
            <p className="text-red-700 text-xs mt-1">
              Please provide feedback to keep your mentee engaged
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
