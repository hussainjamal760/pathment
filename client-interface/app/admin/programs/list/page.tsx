'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, 
  Filter, 
  Plus,
  Users,
  Calendar,
  TrendingUp,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Loader2
} from 'lucide-react';
import { programManagementApi } from '@/lib/services/program-api';
import { toast } from 'sonner';

export default function ProgramListPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const response = await programManagementApi.programs.getAll();
      const programsList = response || response?.programs || [];
      setPrograms(Array.isArray(programsList) ? programsList : []);
    } catch (error) {
      console.error('Failed to fetch programs:', error);
      toast.error(error.response?.data?.message || 'Failed to load programs');
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      await programManagementApi.programs.delete(id);
      toast.success('Program deleted successfully');
      fetchPrograms();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete program');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-slate-900 mb-2">Programs</h1>
          <p className="text-slate-600">Manage all mentorship programs</p>
        </div>
        <Link
          href="/admin/programs/create"
          className="mt-4 sm:mt-0 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Program
        </Link>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search programs..."
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="relative">
            <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
            >
              <option value="name">Name</option>
              <option value="enrollments">Enrollments</option>
              <option value="startDate">Start Date</option>
              <option value="completion">Completion</option>
            </select>
          </div>
        </div>
      </div>

      {/* Programs List */}
      <div className="space-y-4">
        {programs.map((program) => (
          <div
            key={program.id}
            className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow"
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Program Info */}
              <div className="flex-1">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        href={`/admin/programs/${program.id}`}
                        className="text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        {program.name}
                      </Link>
                      <span
                        className={`px-3 py-1 rounded-lg text-xs ${
                          program.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : program.status === 'draft'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {program.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                      <span>{program.type}</span>
                      <span>•</span>
                      <span>{program.level}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {program.startDate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {program.tags && program.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {program.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Progress */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 max-w-xs h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{ width: `${program.completion || 0}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-600">{program.completion || 0}%</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-slate-900 text-2xl mb-1">{program._count?.enrollments || 0}</div>
                  <div className="text-slate-600 text-sm flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    Mentees
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-slate-900 text-2xl mb-1">{program._count?.mentors || program.mentors || 0}</div>
                  <div className="text-slate-600 text-sm">Mentors</div>
                </div>

                {/* Actions */}
                <div className="relative group">
                  <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                    <MoreVertical className="w-5 h-5 text-slate-600" />
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <Link
                      href={`/admin/programs/${program.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-700 first:rounded-t-xl"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                    </Link>
                    <Link
                      href={`/admin/programs/${program.id}/roadmap`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-700"
                    >
                      <Edit className="w-4 h-4" />
                      Edit Roadmap
                    </Link>
                    <button 
                      onClick={() => handleDelete(program.id, program.name)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-red-600 w-full last:rounded-b-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Program
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
