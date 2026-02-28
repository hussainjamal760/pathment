'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Download,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  Users,
  Hourglass,
  UserCheck,
} from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { TablePagination } from '@/components/shared/TablePagination';
import { useEnrollmentList, Enrollment, EnrollmentStatus } from '@/lib/hooks/admin/useEnrollmentList';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EnrollmentStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  active:            { label: 'Active',            className: 'bg-green-100 text-green-700',   icon: <CheckCircle2 className="w-3 h-3" /> },
  matched:           { label: 'Matched',           className: 'bg-green-100 text-green-700',   icon: <CheckCircle2 className="w-3 h-3" /> },
  pending_approval:  { label: 'Pending Approval',  className: 'bg-amber-100 text-amber-700',   icon: <Clock className="w-3 h-3" /> },
  approved:          { label: 'Approved',          className: 'bg-blue-100 text-blue-700',     icon: <Clock className="w-3 h-3" /> },
  pending_match:     { label: 'Pending Match',     className: 'bg-blue-100 text-blue-700',     icon: <Clock className="w-3 h-3" /> },
  level_completed:   { label: 'Level Completed',   className: 'bg-indigo-100 text-indigo-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  program_completed: { label: 'Program Completed', className: 'bg-indigo-100 text-indigo-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected:          { label: 'Rejected',          className: 'bg-red-100 text-red-700',       icon: <XCircle className="w-3 h-3" /> },
  dropped:           { label: 'Dropped',           className: 'bg-red-100 text-red-700',       icon: <XCircle className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as EnrollmentStatus] ?? {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    className: 'bg-slate-100 text-slate-700',
    icon: <Clock className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function AvatarCell({
  firstName, lastName, email,
  colorClass = 'bg-slate-200 text-slate-600',
}: { firstName?: string; lastName?: string; email?: string; colorClass?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${colorClass}`}>
        {(firstName?.[0] ?? '') + (lastName?.[0] ?? '')}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{firstName} {lastName}</p>
        {email && <p className="text-xs text-slate-500 truncate">{email}</p>}
      </div>
    </div>
  );
}

function ProgressCell({ enrollment }: { enrollment: Enrollment }) {
  const pct = parseFloat(enrollment.overallProgressPercentage) || 0;
  return (
    <div className="min-w-[110px]">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-slate-600 tabular-nums w-8 text-right">{pct}%</span>
      </div>
      <p className="text-[11px] text-slate-400">
        {enrollment.tasksCompleted}/{enrollment.tasksTotal} tasks · Week {enrollment.currentWeek}
      </p>
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

const columns: DataTableColumn<Enrollment>[] = [
  {
    key: 'mentee',
    label: 'Mentee',
    render: (_, row) => (
      <AvatarCell firstName={row.mentee?.firstName} lastName={row.mentee?.lastName} email={row.mentee?.email} />
    ),
  },
  {
    key: 'matches',
    label: 'Mentor',
    render: (_, row) => {
      const mentor = row.matches?.[0]?.mentor;
      return mentor ? (
        <AvatarCell firstName={mentor.firstName} lastName={mentor.lastName} email={mentor.email} colorClass="bg-purple-100 text-purple-700" />
      ) : (
        <span className="text-slate-400 text-sm">Not assigned</span>
      );
    },
  },
  {
    key: 'program',
    label: 'Program',
    render: (_, row) => (
      <div className="min-w-0">
        <p className="text-sm text-slate-900 truncate max-w-[180px]">{row.program?.name ?? '—'}</p>
        {row.currentLevel && (
          <p className="text-xs text-slate-500 mt-0.5">Level: {row.currentLevel.name}</p>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (val) => <StatusBadge status={val} />,
  },
  {
    key: 'overallProgressPercentage',
    label: 'Progress',
    render: (_, row) => <ProgressCell enrollment={row} />,
  },
  {
    key: 'enrolledAt',
    label: 'Enrolled',
    sortable: true,
    render: (val) =>
      val ? (
        <span className="text-sm text-slate-600">
          {new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ) : <span className="text-slate-400">—</span>,
  },
];

const STATUS_OPTIONS = [
  { value: 'all',               label: 'All Status' },
  { value: 'pending_approval',  label: 'Pending Approval' },
  { value: 'approved',          label: 'Approved' },
  { value: 'pending_match',     label: 'Pending Match' },
  { value: 'matched',           label: 'Matched' },
  { value: 'active',            label: 'Active' },
  { value: 'level_completed',   label: 'Level Completed' },
  { value: 'program_completed', label: 'Program Completed' },
  { value: 'rejected',          label: 'Rejected' },
  { value: 'dropped',           label: 'Dropped' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EnrollmentOverviewPage() {
  const {
    enrollments, isLoading, error, isEmpty,
    pagination,
    search, status, hasActiveFilters,
    setSearch, setStatus, resetFilters,
    stats, refetch,
  } = useEnrollmentList();

  const statCards = [
    { label: 'Total Enrollments', value: pagination.total,      icon: Users,     color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Active / Matched',  value: stats.active,          icon: UserCheck, color: 'text-green-600 bg-green-50'   },
    { label: 'Pending Approval',  value: stats.pendingApproval, icon: Hourglass, color: 'text-amber-600 bg-amber-50'   },
    { label: 'Pending Match',     value: stats.pendingMatch,     icon: Clock,     color: 'text-blue-600 bg-blue-50'     },
  ];

  return (
    <>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 text-sm mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Enrollment Overview</h1>
          <p className="text-slate-500 text-sm">Track mentee–mentor pairings and program progress</p>
        </div>
        <button className="mt-4 sm:mt-0 inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors text-sm font-medium">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-2xl p-5 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-500">{card.label}</p>
                <div className={`p-2 rounded-xl ${card.color}`}><Icon className="w-4 h-4" /></div>
              </div>
              <p className="text-3xl font-bold text-slate-900">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mentee name, email or program…"
              className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-700 appearance-none bg-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-slate-500">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                "{search}"
                <button onClick={() => setSearch('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {status !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                {STATUS_OPTIONS.find((o) => o.value === status)?.label}
                <button onClick={() => setStatus('all')}><X className="w-3 h-3" /></button>
              </span>
            )}
            <button onClick={resetFilters} className="text-xs text-slate-500 hover:text-slate-700 underline ml-1">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <DataTable<Enrollment>
          columns={columns}
          data={enrollments}
          rowKey="id"
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          skeletonRows={10}
          emptyState={{
            title: hasActiveFilters ? 'No enrollments match your filters' : 'No enrollments yet',
            description: hasActiveFilters
              ? 'Try adjusting your search or status filter'
              : 'Enrollments will appear here once mentees enrol in programs',
            action: hasActiveFilters ? { label: 'Clear filters', onClick: resetFilters } : undefined,
          }}
          className="border-0 rounded-none"
        />

        {!isLoading && !error && !isEmpty && (
          <div className="border-t border-slate-100 px-4">
            <TablePagination pagination={pagination} isLoading={isLoading} showPageSize pageSizeOptions={[10, 20, 50]} />
          </div>
        )}
      </div>
    </>
  );
}
