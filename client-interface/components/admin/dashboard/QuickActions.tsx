'use client';

import Link from 'next/link';
import { Plus, UserCheck, CheckCircle2 } from 'lucide-react';

export function QuickActions() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-slate-900 font-semibold mb-4">Quick Actions</h3>
      <div className="space-y-3">
        <Link
          href="/admin/programs/list?create=1"
          className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
        >
          <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
            <Plus className="w-5 h-5 text-brand-600" />
          </div>
          <span className="text-slate-700">Create Program</span>
        </Link>
        <Link
          href="/admin/matching/mentor-assignment"
          className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
        >
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-purple-600" />
          </div>
          <span className="text-slate-700">Assign Mentors</span>
        </Link>
        <Link
          href="/admin/enrollment/overview"
          className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
        >
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <span className="text-slate-700">View Enrollments</span>
        </Link>
      </div>
    </div>
  );
}
