'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  School,
  BookOpen,
  CheckCircle2,
  Trophy,
  ExternalLink,
  Flame,
  Trash2,
  Pencil,
  Users2,
  Loader2,
  ShieldOff,
  ShieldCheck,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TablePagination } from '@/components/shared/TablePagination';
import {
  StatsCard,
  PageHeader,
  SearchAndFilterBar,
  AvatarWithInitials,
} from '@/components/admin/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMenteesList, MenteeListItem } from '@/lib/hooks/admin/useMenteesList';
import { PausedMenteesPanel } from '@/components/mentor/PausedMenteesPanel';
import { ReassignClanModal } from '@/components/admin/ReassignClanModal';
import { EditUserDrawer } from '@/components/admin/EditUserDrawer';
import { menteeApi } from '@/lib/services/mentee-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';
import { useConfirm } from '@/lib/context/ConfirmContext';

// ─── Column definitions ───────────────────────────────────────────────────────

/** "Today" / "Yesterday" / "5d ago" / "3 mo ago" / "Never". */
function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Never';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}



// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMenteesListPage() {
  const {
    mentees,
    isLoading,
    error,
    pagination,
    search,
    setSearch,
    refetch,
  } = useMenteesList();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const confirm = useConfirm();
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [suspendLoading, setSuspendLoading] = useState<string | null>(null);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendRow, setSuspendRow] = useState<MenteeListItem | null>(null);
  const [movingMentee, setMovingMentee] = useState<MenteeListItem | null>(null);
  const [editUser, setEditUser] = useState<MenteeListItem | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm({ title: `Delete ${name}?`, description: `This permanently removes all their enrollments and data and cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      setDeleteLoading(id);
      await menteeApi.deleteUser(id);
      toast.success(`${name} has been deleted.`);
      refetch();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Could not delete user'));
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleOpenSuspendModal = (row: MenteeListItem) => {
    setSuspendRow(row);
    setSuspendModalOpen(true);
  };

  const handleCloseSuspendModal = () => {
    setSuspendModalOpen(false);
    setSuspendRow(null);
  };

  const handleConfirmSuspend = async () => {
    if (!suspendRow) return;

    const row = suspendRow;
    const isSuspended = row.status === 'suspended';
    const name = `${row.firstName} ${row.lastName}`;

    try {
      setSuspendLoading(row.id);
      if (isSuspended) {
        await menteeApi.unsuspendUser(row.id);
        toast.success(`${name} has been unsuspended.`);
      } else {
        await menteeApi.suspendUser(row.id);
        toast.success(`${name} has been suspended.`);
      }
      handleCloseSuspendModal();
      refetch();
    } catch (err: unknown) {
      toast.error(
        extractApiErrorMessage(
          err,
          `Could not ${isSuspended ? 'unsuspend' : 'suspend'} user`,
        ),
      );
    } finally {
      setSuspendLoading(null);
    }
  };

  // Stats derived from current page
  const enrolledCount = mentees.filter(
    (m) => (m.menteeProfile?.totalProgramsEnrolled ?? 0) > 0
  ).length;

  const completedPrograms = mentees.reduce(
    (sum, m) => sum + (m.menteeProfile?.totalProgramsCompleted ?? 0),
    0
  );

  const totalPoints = mentees.reduce(
    (sum, m) => sum + (m.menteeProfile?.totalPoints ?? 0),
    0
  );



  return (
    <div className="space-y-6">
      <PageHeader
        title="Mentees"
        subtitle="All registered mentees on the platform"
        backHref="/admin/dashboard"
        backLabel="Back to Dashboard"
      />

      {/* Inactive mentees: suggested-to-pause queue + currently paused (org-wide). */}
      <PausedMenteesPanel menteeBasePath="/admin/mentees" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={School}
          label="Total Mentees"
          value={isLoading ? '-' : pagination.total}
          colorClass="text-brand-600 bg-brand-50"
        />
        <StatsCard
          icon={BookOpen}
          label="Currently Enrolled"
          value={isLoading ? '-' : enrolledCount}
          colorClass="text-blue-600 bg-blue-50"
          sub="on this page"
        />
        <StatsCard
          icon={CheckCircle2}
          label="Programs Completed"
          value={isLoading ? '-' : completedPrograms}
          colorClass="text-green-600 bg-green-50"
          sub="on this page"
        />
        <StatsCard
          icon={Trophy}
          label="Total Points Earned"
          value={isLoading ? '-' : totalPoints.toLocaleString()}
          colorClass="text-amber-600 bg-amber-50"
          sub="on this page"
        />
      </div>

      {/* Search */}
      <SearchAndFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name or email…"
      />

      {/* Mentees Collapsible List */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px] border border-slate-200 rounded-xl bg-card">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="p-6 text-center border border-red-200 rounded-xl bg-red-50">
          <p className="text-red-900 mb-2">{error}</p>
          <button onClick={refetch} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">Retry</button>
        </div>
      ) : mentees.length === 0 ? (
        <div className="p-8 text-center border border-slate-200 rounded-xl bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900">No mentees found</h3>
          <p className="text-sm text-slate-500 mt-1">
            {search
              ? 'No mentees match your search. Try a different name or email.'
              : 'No mentees are registered on the platform yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mentees.map((row) => {
            const isExpanded = expandedIds.has(row.id);
            const name = `${row.firstName} ${row.lastName}`;
            const isSuspended = row.status === 'suspended';
            const mp = row.menteeProfile;
            const primaryBg = mp?.currentOccupation ?? mp?.currentEducation;
            const secondaryBg = mp?.currentOccupation ? mp?.currentEducation : undefined;

            return (
              <div
                key={row.id}
                className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:border-slate-300 transition-colors"
              >
                {/* Header / Summary */}
                <div
                  onClick={() => toggleExpand(row.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarWithInitials
                      firstName={row.firstName}
                      lastName={row.lastName}
                      email={row.email}
                      src={row.profilePictureUrl}
                      href={`/admin/mentees/${row.id}`}
                      colorClass="bg-brand-100 text-brand-700"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm truncate">{name}</span>
                        {isSuspended && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-medium dark:bg-amber-500/10 dark:text-amber-300">Suspended</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 truncate block">{row.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 text-slate-600">
                    {row.currentClan ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <Users2 className="w-3.5 h-3.5 text-slate-400" />
                        {row.currentClan.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">Unassigned</span>
                    )}

                    {primaryBg && (
                      <span className="text-xs text-slate-500 hidden md:inline max-w-[150px] truncate">
                        {primaryBg}
                      </span>
                    )}

                    <div className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                  </div>
                </div>

                {/* Collapsible Content */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Programs</span>
                        <div className="mt-1 text-slate-700">
                          <span className="font-medium text-slate-900">{mp?.totalProgramsEnrolled ?? 0}</span> enrolled
                          <span className="text-slate-300 mx-1.5">·</span>
                          <span className="font-medium text-green-600">{mp?.totalProgramsCompleted ?? 0}</span> completed
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Progress</span>
                        <div className="mt-1 text-slate-700">
                          <span className="font-medium text-slate-900">{mp?.totalTasksCompleted ?? 0}</span> tasks done
                          <span className="text-slate-300 mx-1.5">·</span>
                          <span className="text-brand-600 font-medium">Lvl {mp?.currentLevel ?? 1}</span> ({mp?.totalPoints?.toLocaleString() ?? 0} pts)
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Streak & Activity</span>
                        <div className="mt-1 flex items-center gap-3">
                          {(mp?.currentStreakDays ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-orange-600 font-medium">
                              <Flame className="w-3.5 h-3.5" />
                              {mp?.currentStreakDays}d streak
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-600">Active {relativeTime(mp?.lastActivityDate)}</span>
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Details</span>
                        <div className="mt-1 text-slate-600 space-y-0.5">
                          {secondaryBg && <p className="truncate">Edu: {secondaryBg}</p>}
                          <p>Joined: {row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                      <Link
                        href={`/admin/mentees/${row.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        title={`View profile for ${name}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Profile
                      </Link>
                      <button
                        onClick={() => setMovingMentee(row)}
                        title="Move to another clan"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Move clan
                      </button>
                      <button
                        onClick={() => handleOpenSuspendModal(row)}
                        disabled={suspendLoading === row.id}
                        title={isSuspended ? 'Unsuspend' : 'Suspend'}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                          isSuspended
                            ? 'text-green-700 hover:bg-green-50'
                            : 'text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        {suspendLoading === row.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : isSuspended
                            ? <ShieldCheck className="w-3.5 h-3.5" />
                            : <ShieldOff className="w-3.5 h-3.5" />}
                        {isSuspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                      <button
                        onClick={() => setEditUser(row)}
                        title="Edit user"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(row.id, name)}
                        disabled={deleteLoading === row.id}
                        title="Delete permanently"
                        className="inline-flex items-center justify-center w-7 h-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deleteLoading === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TablePagination pagination={pagination} isLoading={isLoading} />

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={suspendModalOpen} onOpenChange={setSuspendModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendRow?.status === 'suspended' ? 'Unsuspend User?' : 'Suspend User?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendRow?.status === 'suspended'
                ? `You are about to unsuspend ${suspendRow.firstName} ${suspendRow.lastName}. They will be able to log in again.`
                : `You are about to suspend ${suspendRow?.firstName} ${suspendRow?.lastName}. They will be logged out immediately and cannot log in until unsuspended.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suspendLoading === suspendRow?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSuspend}
              disabled={suspendLoading === suspendRow?.id}
              className={suspendRow?.status === 'suspended' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {suspendLoading === suspendRow?.id
                ? 'Processing...'
                : suspendRow?.status === 'suspended'
                  ? 'Unsuspend'
                  : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {movingMentee && (
        <ReassignClanModal
          menteeId={movingMentee.id}
          menteeName={`${movingMentee.firstName} ${movingMentee.lastName}`}
          currentClanId={movingMentee.currentClan?.id ?? null}
          currentProgramId={movingMentee.currentClan?.programId ?? null}
          onClose={() => setMovingMentee(null)}
          onDone={refetch}
        />
      )}

      {editUser && (
        <EditUserDrawer
          user={{ id: editUser.id, firstName: editUser.firstName, lastName: editUser.lastName, email: editUser.email, role: 'mentee' }}
          onClose={() => setEditUser(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
