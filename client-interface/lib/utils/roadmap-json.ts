// Serialize a roadmap (mentor "local" or admin "org") to the same JSON template
// the editor imports — so export → tweak → re-import round-trips cleanly.

interface ExportStep {
  title: string;
  type?: string;
  description?: string;
  acceptanceCriteria?: string[];
  effort?: string | null;
  dueOffsetDays?: number | null;
  difficulty?: string | null;
  deliverable?: string | null;
  pointsBase?: number | null;
  resources?: { title: string; url: string; resourceType?: string | null }[];
}
export interface ExportRoadmap {
  name: string;
  description?: string | null;
  skillTags?: string[];
  steps: ExportStep[];
}

export function roadmapToJsonString(r: ExportRoadmap): string {
  return JSON.stringify({
    name: r.name,
    description: r.description || undefined,
    skillTags: r.skillTags || [],
    steps: (r.steps || []).map((s) => ({
      title: s.title,
      type: s.type,
      effort: s.effort || undefined,
      difficulty: s.difficulty || undefined,
      points: s.pointsBase != null ? s.pointsBase : undefined,
      dueOffsetDays: s.dueOffsetDays != null ? s.dueOffsetDays : undefined,
      description: s.description || undefined,
      criteria: s.acceptanceCriteria || [],
      deliverable: s.deliverable || undefined,
      resources: (s.resources || []).map((r) => ({ label: r.title, url: r.url })),
    })),
  }, null, 2);
}

export function downloadRoadmapJson(r: ExportRoadmap): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([roadmapToJsonString(r)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(r.name || 'roadmap').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
