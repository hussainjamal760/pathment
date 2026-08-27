'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Edit2, Loader2, Award, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';
import { certificatesApi, CertificateTemplate } from '@/lib/services/certificates-api';
import { ConfirmModal } from '@/components/shared';

export default function AdminCertificatesPage() {
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Delete confirm states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await certificatesApi.listTemplates();
      if (res.success && res.data) {
        setTemplates(res.data);
      }
    } catch (err: any) {
      toast.error('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const requestDelete = (id: string) => {
    setTemplateToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      const res = await certificatesApi.deleteTemplate(templateToDelete);
      if (res.success) {
        toast.success('Template deleted successfully');
        fetchTemplates();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
    } finally {
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Certificates</h1>
          <p className="text-xs text-muted-foreground">Manage templates and issue certificates to mentees</p>
        </div>
        <Link
          href="/admin/certificates/new"
          className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Template
        </Link>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
          <span className="text-sm text-muted-foreground font-medium">Loading templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-2xl p-8 bg-card text-center">
          <Award className="w-12 h-12 text-brand-500 mb-3 opacity-80" />
          <h3 className="text-sm font-bold text-foreground mb-1">No Templates Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            Create certificate templates using background images, logos, and dynamic placeholders to issue to mentees.
          </p>
          <Link
            href="/admin/certificates/new"
            className="px-4 py-2 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors"
          >
            Create Your First Template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => {
            const dateStr = new Date(template.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            return (
              <div 
                key={template.id} 
                className="group bg-card border border-border hover:border-brand-500/30 rounded-2xl overflow-hidden shadow-2xs hover:shadow-xs transition-all flex flex-col"
              >
                {/* Image Preview Container */}
                <div className="relative aspect-[1.414] bg-muted overflow-hidden border-b border-border">
                  {template.bgImageUrl ? (
                    <img 
                      src={template.bgImageUrl} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" 
                      alt="Certificate Background" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Award className="w-10 h-10" />
                    </div>
                  )}
                  {template.logoUrl && (
                    <img 
                      src={template.logoUrl} 
                      className="absolute top-4 right-4 w-8 h-8 rounded-full border border-white/50 object-contain shadow-sm bg-white" 
                      alt="Logo" 
                    />
                  )}
                </div>

                {/* Details Footer */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-foreground line-clamp-1">{template.name}</h3>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-semibold">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-brand-500" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-brand-500" />
                        {template.creator ? `${template.creator.firstName} ${template.creator.lastName.slice(0, 1)}.` : 'Admin'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/admin/certificates/${template.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-colors"
                    >
                      <Award className="w-3.5 h-3.5" />
                      Issue
                    </Link>
                    <Link
                      href={`/admin/certificates/${template.id}/edit`}
                      className="p-2 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => requestDelete(template.id)}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl transition-colors border border-transparent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Delete Certificate Template"
        message="Are you sure you want to delete this template? Issued certificates using this template will not be affected."
        confirmLabel="Delete"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setTemplateToDelete(null);
        }}
      />
    </div>
  );
}
