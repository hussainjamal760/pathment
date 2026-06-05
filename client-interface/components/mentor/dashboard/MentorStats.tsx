'use client';

import { CheckSquare, Clock, AlertCircle } from 'lucide-react';
import { StatsCard } from '@/components/admin/ui';

export function MentorStats() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatsCard icon={CheckSquare} label="Active Mentees"    value="8"  sub="2 new this week"  colorClass="text-brand-600 bg-brand-50" />
      <StatsCard icon={Clock}       label="Pending Reviews"   value="5"  sub="3 high priority" colorClass="text-yellow-600 bg-yellow-50" />
      <StatsCard icon={AlertCircle} label="Tasks Assigned"    value="24" sub="This month"       colorClass="text-blue-600 bg-blue-50" />
    </div>
  );
}
