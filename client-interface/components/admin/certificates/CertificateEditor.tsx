'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
  ArrowLeft, Save, Plus, Trash2, Move, Type, Edit,
  Image as ImageIcon, AlignLeft, AlignCenter, AlignRight,
  Bold, Loader2, ZoomIn, ZoomOut, Award,
  CheckCircle, Users, Trash, Search, Send, Info
} from 'lucide-react';
import Link from 'next/link';
import { certificatesApi, CertificateElement, CertificateTemplate } from '@/lib/services/certificates-api';
import { FileDragDrop } from '@/components/shared/FileDragDrop';
import { DuplicateWarnModal } from '@/components/shared';
import { Drawer } from '@/components/shared/Drawer';
import { orgRoadmapApi } from '@/lib/services/roadmap-api';
import { programsApi } from '@/lib/services/program-api';
import CertificateHistoryLog from './CertificateHistoryLog';
import { getTierBadgeColor, getTierButtonColor, getTierIconColor } from '@/lib/utils/certificates';

interface CertificateEditorProps {
  templateId?: string; // If provided, we are in Edit Mode
}

interface TierCriteria {
  id: string;
  name: string;
  badgeUrl?: string;
  taskIds: string[];
}

const FONTS = [
  { value: 'Montserrat, sans-serif', label: 'Montserrat (Modern Sans)' },
  { value: 'Playfair Display, serif', label: 'Playfair Display (Elegant Serif)' },
  { value: 'Cinzel, serif', label: 'Cinzel (Classic Roman)' },
  { value: 'Great Vibes, cursive', label: 'Great Vibes (Calligraphy Script)' },
  { value: 'Alex Brush, cursive', label: 'Alex Brush (Elegant Handwriting)' },
  { value: 'Oswald, sans-serif', label: 'Oswald (Bold Cond)' },
  { value: 'Lustria, serif', label: 'Lustria (Editorial)' },
  { value: 'Sacramento, cursive', label: 'Sacramento (Retro Monoline)' },
  { value: 'Merriweather, serif', label: 'Merriweather (Classic Serif)' },
  { value: 'Courier New, monospace', label: 'Courier New (Mono)' }
];

const DYNAMIC_SHORTCUTS = [
  { key: 'mentee_name', label: 'Member Name', tag: '{{name}}' },
  { key: 'fellowship_name', label: 'Fellowship Name', tag: '{{fellowship_name}}' },
  { key: 'date_issued', label: 'Date', tag: '{{date}}' },
  { key: 'issuer_name', label: 'Issuer Name', tag: '{{issuer_name}}' },
  { key: 'issuer_title', label: 'Issuer Title', tag: '{{issuer_title}}' }
];

const BACKGROUND_PRESETS = [
  {
    id: 'elegant_luxury',
    name: 'Elegant Luxury',
    description: 'Double gold border with corner flourishes and warm background wash',
    previewGradient: 'from-[#fffdfa] via-[#faf6ee] to-[#f3ede0] border-amber-500/40',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="848" viewBox="0 0 1200 848">
  <defs>
    <radialGradient id="cream-glow" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#fffdfa"/>
      <stop offset="60%" stop-color="#faf6ee"/>
      <stop offset="100%" stop-color="#f3ede0"/>
    </radialGradient>
    <linearGradient id="gold-metal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c5a059"/>
      <stop offset="30%" stop-color="#fdf0cd"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="70%" stop-color="#fdf0cd"/>
      <stop offset="100%" stop-color="#a1813c"/>
    </linearGradient>
    <linearGradient id="accent-wash" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e2e8f0" stop-opacity="0.6"/>
      <stop offset="50%" stop-color="#dcd7c9" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#a3b18a" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#cream-glow)"/>
  <path d="M 0 500 C 300 600, 500 800, 700 848 L 0 848 Z" fill="url(#accent-wash)"/>
  <rect x="35" y="35" width="1130" height="778" fill="none" stroke="url(#gold-metal)" stroke-width="3" rx="16"/>
  <rect x="45" y="45" width="1110" height="758" fill="none" stroke="url(#gold-metal)" stroke-width="0.75" rx="12" stroke-dasharray="12 6"/>
  <g stroke="url(#gold-metal)" stroke-width="1.5" fill="none">
    <path d="M 25 65 L 65 25 M 30 75 L 75 30"/>
    <path d="M 1175 65 L 1135 25 M 1170 75 L 1125 30"/>
    <path d="M 25 783 L 65 823 M 30 773 L 75 818"/>
    <path d="M 1175 783 L 1135 823 M 1170 773 L 1125 818"/>
  </g>
</svg>`
  },
  {
    id: 'tech_aurora',
    name: 'Tech Aurora',
    description: 'Sleek tech navy background with organic cyan and violet glows',
    previewGradient: 'from-[#05070f] via-[#0a0f24] to-[#141a36] border-indigo-500/50',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="848" viewBox="0 0 1200 848">
  <defs>
    <linearGradient id="tech-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#05070f"/>
      <stop offset="50%" stop-color="#0a0f24"/>
      <stop offset="100%" stop-color="#141a36"/>
    </linearGradient>
    <radialGradient id="glow-violet" cx="90%" cy="10%" r="60%">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.4"/>
      <stop offset="50%" stop-color="#c084fc" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow-teal" cx="10%" cy="90%" r="70%">
      <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.35"/>
      <stop offset="50%" stop-color="#0891b2" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="neon-border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.6"/>
      <stop offset="50%" stop-color="#06b6d4" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#tech-bg)"/>
  <rect width="100%" height="100%" fill="url(#glow-violet)"/>
  <rect width="100%" height="100%" fill="url(#glow-teal)"/>
  <path d="M 0 100 L 1200 100 M 0 200 L 1200 200 M 0 300 L 1200 300 M 0 400 L 1200 400 M 0 500 L 1200 500 M 0 600 L 1200 600 M 0 700 L 1200 700" stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.5"/>
  <path d="M 150 0 L 150 848 M 300 0 L 300 848 M 450 0 L 450 848 M 600 0 L 600 848 M 750 0 L 750 848 M 900 0 L 900 848 M 1050 0 L 1050 848" stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.5"/>
  <path d="M-100 848 C 350 700, 450 450, 1300 848 Z" fill="#06b6d4" fill-opacity="0.03"/>
  <path d="M-100 848 C 300 550, 600 650, 1300 848 Z" fill="#7c3aed" fill-opacity="0.02"/>
  <rect x="35" y="35" width="1130" height="778" fill="none" stroke="url(#neon-border)" stroke-width="1.5" rx="20"/>
  <path d="M 30 70 L 30 30 L 70 30" fill="none" stroke="#8b5cf6" stroke-width="3"/>
  <path d="M 1170 70 L 1170 30 L 1130 30" fill="none" stroke="#8b5cf6" stroke-width="3"/>
  <path d="M 30 778 L 30 818 L 70 818" fill="none" stroke="#06b6d4" stroke-width="3"/>
  <path d="M 1170 778 L 1170 818 L 1130 818" fill="none" stroke="#06b6d4" stroke-width="3"/>
</svg>`
  },
  {
    id: 'royal_midnight',
    name: 'Royal Midnight',
    description: 'Foil gold geometric frames on deepest midnight black canvas',
    previewGradient: 'from-[#0c111d] via-[#080b11] to-[#030712] border-amber-600/50',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="848" viewBox="0 0 1200 848">
  <defs>
    <linearGradient id="midnight-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0c111d"/>
      <stop offset="100%" stop-color="#030712"/>
    </linearGradient>
    <linearGradient id="foil-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bf953f"/>
      <stop offset="25%" stop-color="#fcf6ba"/>
      <stop offset="50%" stop-color="#b38728"/>
      <stop offset="75%" stop-color="#fbf5b7"/>
      <stop offset="100%" stop-color="#aa771c"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#midnight-bg)"/>
  <circle cx="600" cy="424" r="300" fill="none" stroke="#1f2937" stroke-width="1" stroke-opacity="0.3"/>
  <circle cx="600" cy="424" r="280" fill="none" stroke="#1f2937" stroke-dasharray="10 5" stroke-width="1" stroke-opacity="0.3"/>
  <circle cx="600" cy="424" r="260" fill="none" stroke="#1f2937" stroke-width="0.5" stroke-opacity="0.2"/>
  <rect x="40" y="40" width="1120" height="768" fill="none" stroke="url(#foil-gold)" stroke-width="3.5" rx="8"/>
  <rect x="52" y="52" width="1096" height="744" fill="none" stroke="url(#foil-gold)" stroke-width="1" rx="6" stroke-opacity="0.7"/>
  <g fill="url(#foil-gold)">
    <path d="M 52 52 L 92 52 L 92 62 L 72 62 L 72 82 L 52 82 Z" opacity="0.85"/>
    <path d="M 1148 52 L 1108 52 L 1108 62 L 1128 62 L 1128 82 L 1148 82 Z" opacity="0.85"/>
    <path d="M 52 796 L 92 796 L 92 786 L 72 786 L 72 766 L 52 766 Z" opacity="0.85"/>
    <path d="M 1148 796 L 1108 796 L 1108 786 L 1128 786 L 1128 766 L 1148 766 Z" opacity="0.85"/>
  </g>
</svg>`
  },
  {
    id: 'chroma_glass',
    name: 'Chroma Glass',
    description: 'Vibrant blur mesh gradient with frosted glass border overlay',
    previewGradient: 'from-[#ffedd5] via-[#fae8ff] to-[#e0f2fe] border-pink-400/30',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="848" viewBox="0 0 1200 848">
  <defs>
    <linearGradient id="chroma-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0e7ff"/>
      <stop offset="100%" stop-color="#fae8ff"/>
    </linearGradient>
    <radialGradient id="chroma-1" cx="30%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#ffedd5" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="chroma-2" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="chroma-3" cx="70%" cy="80%" r="50%">
      <stop offset="0%" stop-color="#f3e8ff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#chroma-bg)"/>
  <rect width="100%" height="100%" fill="url(#chroma-1)"/>
  <rect width="100%" height="100%" fill="url(#chroma-2)"/>
  <rect width="100%" height="100%" fill="url(#chroma-3)"/>
  <rect x="35" y="35" width="1130" height="778" fill="none" stroke="#ffffff" stroke-width="4" rx="28" stroke-opacity="0.6"/>
  <rect x="39" y="39" width="1122" height="770" fill="none" stroke="#cbd5e1" stroke-width="1" rx="24" stroke-opacity="0.2"/>
</svg>`
  },
  {
    id: 'swiss_bauhaus',
    name: 'Swiss Bauhaus',
    description: 'Clean modern alabaster layout with geometric intersecting shapes',
    previewGradient: 'from-[#fafafa] to-[#f4f4f5] border-rose-300/30',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="848" viewBox="0 0 1200 848">
  <defs>
    <linearGradient id="bauhaus-accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#fafafa"/>
  <rect x="0" y="0" width="1200" height="14" fill="#0f172a"/>
  <g fill="#e2e8f0" opacity="0.6">
    <rect x="100" y="80" width="24" height="8" rx="2"/>
    <rect x="108" y="72" width="8" height="24" rx="2"/>
  </g>
  <circle cx="1050" cy="424" r="300" fill="url(#bauhaus-accent)"/>
  <circle cx="1050" cy="424" r="200" fill="none" stroke="#e2e8f0" stroke-width="1.5"/>
  <circle cx="1050" cy="424" r="120" fill="none" stroke="#cbd5e1" stroke-dasharray="6 6" stroke-width="1"/>
  <rect x="35" y="35" width="1130" height="778" fill="none" stroke="#0f172a" stroke-width="1.5" rx="4"/>
</svg>`
  }
];

export default function CertificateEditor({ templateId }: CertificateEditorProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  
  // Upload states
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingTierBadge, setUploadingTierBadge] = useState(false);

  // Zoom state
  const [zoom, setZoom] = useState(1.0);
  
  // Template states
  const [name, setName] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('https://res.cloudinary.com/djctfho31/image/upload/v1724683050/pathment/templates/default-cert-bg.jpg');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isPresetsDrawerOpen, setIsPresetsDrawerOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoConfig, setLogoConfig] = useState({ xPercent: 50, yPercent: 20, widthPercent: 12 });
  
  // Elements & Dragging
  const [elements, setElements] = useState<CertificateElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | 'logo' | null>(null);

  // Dynamic Tiers state (Step 2)
  const [criteria, setCriteria] = useState<TierCriteria[]>([
    { id: 'gold', name: 'Gold Certificate', badgeUrl: '', taskIds: [] },
    { id: 'silver', name: 'Silver Certificate', badgeUrl: '', taskIds: [] },
    { id: 'bronze', name: 'Bronze Certificate', badgeUrl: '', taskIds: [] },
    { id: 'participation', name: 'Participation Certificate', badgeUrl: '', taskIds: [] }
  ]);

  // Roadmap tasks & Programs
  const [availableTasks, setAvailableTasks] = useState<Array<{ id: string; title: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  // Auto-Qualification results
  const [qualifiedData, setQualifiedData] = useState<Record<string, any[]>>({});
  const [loadingQualifications, setLoadingQualifications] = useState(false);

  // Recipient Select Tier
  const [issuing, setIssuing] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedMenteeIds, setSelectedMenteeIds] = useState<Set<string>>(new Set());
  const [sendingToMentors, setSendingToMentors] = useState(false);
  const [recipientType, setRecipientType] = useState<'all' | 'mentees' | 'mentors'>('all');

  // Admin manual tier selections for each mentee
  const [adminTiers, setAdminTiers] = useState<Record<string, string>>({});
  const [isRulesDrawerOpen, setIsRulesDrawerOpen] = useState(false);
  const [criteriaTasks, setCriteriaTasks] = useState<Array<{ id: string; title: string }>>([]);

  const getTierName = (tierId: string) => {
    const match = criteria.find(c => c.id === tierId);
    return match ? match.name : tierId.charAt(0).toUpperCase() + tierId.slice(1);
  };

  // Duplicate warn modal state
  const [duplicateWarnState, setDuplicateWarnState] = useState<{
    isOpen: boolean;
    duplicates: Array<{ id: string; name: string; email: string; tier: string }>;
    allSelectedRecipients: Array<{ menteeId: string; tier: string }>;
  }>({
    isOpen: false,
    duplicates: [],
    allSelectedRecipients: []
  });

  const [refreshKey, setRefreshKey] = useState(0);

  // Tier Dialog Modals
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<TierCriteria | null>(null);
  const [tierModalName, setTierModalName] = useState('');
  const [tierModalBadgeUrl, setTierModalBadgeUrl] = useState('');
  const [tierModalTaskIds, setTierModalTaskIds] = useState<string[]>([]);

  // Fetch roadmap tasks & cohorts on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [roadmapRes, programsRes] = await Promise.all([
          orgRoadmapApi.list(),
          programsApi.getAll({ limit: 100 })
        ]);

        // Load tasks list
        if (roadmapRes.data && Array.isArray(roadmapRes.data.roadmaps)) {
          const flat: Array<{ id: string; title: string }> = [];
          roadmapRes.data.roadmaps.forEach((rm: any) => {
            if (Array.isArray(rm.steps)) {
              rm.steps.forEach((step: any) => {
                if (step.id && step.title) {
                  if (!flat.some(f => f.id === step.id)) {
                    flat.push({ id: step.id, title: step.title });
                  }
                }
              });
            }
          });
          setAvailableTasks(flat);
        }

        // Load cohorts
        if (programsRes.success && programsRes.data) {
          setPrograms(programsRes.data);
          if (programsRes.data.length > 0) {
            setSelectedProgramId(programsRes.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };
    loadData();
  }, []);

  // Fetch initial template if editing
  useEffect(() => {
    if (!templateId) return;
    
    const fetchTemplate = async () => {
      try {
        setFetching(true);
        const res = await certificatesApi.getTemplate(templateId);
        if (res.success && res.data) {
          const t = res.data;
          setName(t.name);
          const bg = t.bgImageUrl || '';
          setBgImageUrl(bg);
          const matchPreset = BACKGROUND_PRESETS.find(p => {
            const base64Svg = typeof window !== 'undefined' ? btoa(unescape(encodeURIComponent(p.svg))) : '';
            const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
            return bg === dataUrl;
          });
          if (matchPreset) {
            setActivePresetId(matchPreset.id);
          }
          setLogoUrl(t.logoUrl || '');
          if (t.logoConfig) setLogoConfig(t.logoConfig);
          setElements(t.config || []);
          if (Array.isArray(t.criteria)) {
            setCriteria(t.criteria);
          }
        }
      } catch (err: any) {
        toast.error('Failed to load certificate template');
        console.error(err);
      } finally {
        setFetching(false);
      }
    };
    
    fetchTemplate();
  }, [templateId]);

  // Load cohort qualifications when cohort/program or criteria change
  useEffect(() => {
    if (!templateId || !selectedProgramId) return;

    const fetchQualifications = async () => {
      try {
        setLoadingQualifications(true);
        const res = await certificatesApi.getQualification(templateId, { programId: selectedProgramId });
        if (res.success && res.data) {
          setQualifiedData(res.data);
          if (res.criteriaTasks) {
            setCriteriaTasks(res.criteriaTasks);
          } else {
            setCriteriaTasks([]);
          }

          // Get list of active mentees
          const activeList: any[] = [];
          const seenIds = new Set<string>();

          criteria.forEach(c => {
            const list = res.data[c.id] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          // Pick up any remaining mentees from data keys not covered by criteria
          Object.keys(res.data).forEach(key => {
            if (key === 'mentors' || key === 'paused') return;
            const list = res.data[key] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          const mentorsList = res.data.mentors ?? [];

          const initialTiers: Record<string, string> = {};
          const autoSelected = new Set<string>();

          activeList.forEach(m => {
            let defTier = m.assignedTier;
            if (!defTier || !criteria.some(c => c.id === defTier)) {
              let maxMatch = -1;
              let bestTierId = criteria[criteria.length - 1]?.id || 'participation';
              criteria.forEach(c => {
                const match = m.tierMatches?.[c.id] ?? 0;
                if (match > maxMatch) {
                  maxMatch = match;
                  bestTierId = c.id;
                }
              });
              defTier = bestTierId;
            }
            initialTiers[m.id] = defTier;

            // Auto-select if criteriaMatch is high (>= 90%)
            const matchPercent = m.tierMatches?.[defTier] ?? 0;
            if (matchPercent >= 90) {
              autoSelected.add(m.id);
            }
          });

          // Set default for mentors to the last tier ID or 'participation' and auto-select them
          const mentorDefaultTier = criteria[criteria.length - 1]?.id || 'participation';
          mentorsList.forEach(m => {
            initialTiers[m.id] = mentorDefaultTier;
            autoSelected.add(m.id);
          });

          setAdminTiers(initialTiers);
          setSelectedMenteeIds(autoSelected);
        }
      } catch (err) {
        console.error('Failed to calculate qualification counts:', err);
      } finally {
        setLoadingQualifications(false);
      }
    };

    fetchQualifications();
  }, [templateId, selectedProgramId, refreshKey]);

  // Handle Drag Move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activeDragId || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    let xPercent = Math.round((x / rect.width) * 100);
    let yPercent = Math.round((y / rect.height) * 100);
    
    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));
    
    if (activeDragId === 'logo') {
      setLogoConfig(prev => ({ ...prev, xPercent, yPercent }));
    } else {
      setElements(prev => prev.map(el => 
        el.id === activeDragId ? { ...el, xPercent, yPercent } : el
      ));
    }
  };

  const handleMouseUp = () => {
    setActiveDragId(null);
  };

  const handleBgUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingBg(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setBgImageUrl(res.url);
        setActivePresetId(null);
        toast.success('Background image uploaded successfully!');
      }
    } catch (err: any) {
      toast.error('Failed to upload background image');
    } finally {
      setUploadingBg(false);
    }
  };

  const applyPresetBackground = (presetId: string, svgString: string) => {
    try {
      const base64Svg = typeof window !== 'undefined' ? btoa(unescape(encodeURIComponent(svgString))) : '';
      const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
      setBgImageUrl(dataUrl);
      setActivePresetId(presetId);
      toast.success('Preset layout applied! Remember to click "Save Template" to persist your changes.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to apply preset background');
    }
  };

  const handleLogoUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingLogo(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setLogoUrl(res.url);
        toast.success('Logo uploaded successfully!');
      }
    } catch (err: any) {
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Add variable element onto canvas
  const addVariableElement = (key: string, label: string) => {
    // Avoid duplicates
    if (elements.some(el => el.dynamicKey === key)) {
      const match = elements.find(el => el.dynamicKey === key);
      if (match) setSelectedId(match.id);
      toast.info(`${label} variable is already added to workspace`);
      return;
    }

    const id = `text-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'dynamic',
      dynamicKey: key as any,
      text: `{{${key}}}`,
      xPercent: 50,
      yPercent: 40 + elements.length * 5,
      fontSizePercent: 3.0,
      color: '#1e293b',
      fontWeight: 'bold',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };
    
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
    toast.success(`Added ${label} variable to template canvas!`);
  };

  const addStaticTextElement = () => {
    const id = `text-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'static',
      text: 'Double click to edit text',
      xPercent: 50,
      yPercent: 50,
      fontSizePercent: 2.5,
      color: '#1e293b',
      fontWeight: 'normal',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  const addBadgeElement = () => {
    if (elements.some(el => el.type === 'badge')) {
      toast.warning('A dynamic badge element is already added to canvas layout.');
      return;
    }
    const id = `badge-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'badge',
      text: 'Badge Layer',
      xPercent: 50,
      yPercent: 75,
      widthPercent: 12,
      fontSizePercent: 1,
      color: '#000000',
      fontWeight: 'normal',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  const addPathmentLogoElement = () => {
    const id = `img-pathment-${Date.now()}`;
    const origin = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    const newEl: CertificateElement = {
      id,
      type: 'image',
      text: 'Pathment Logo',
      xPercent: 50,
      yPercent: 30,
      widthPercent: 12,
      imageUrl: `${origin}/icon-192.png`,
      fontSizePercent: 1,
      color: '#000000',
      fontWeight: 'normal',
      alignment: 'center'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
    toast.success('Pathment Logo added to canvas!');
  };

  const handleCustomImageUpload = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    try {
      toast.info('Uploading custom image...');
      const res = await certificatesApi.uploadAsset(file);
      if (res.success && res.url) {
        const id = `img-custom-${Date.now()}`;
        const newEl: CertificateElement = {
          id,
          type: 'image',
          text: 'Custom Image',
          xPercent: 50,
          yPercent: 40,
          widthPercent: 15,
          imageUrl: res.url,
          fontSizePercent: 1,
          color: '#000000',
          fontWeight: 'normal',
          alignment: 'center'
        };
        setElements(prev => [...prev, newEl]);
        setSelectedId(id);
        toast.success('Custom image uploaded and added to canvas!');
      }
    } catch (err: any) {
      toast.error('Failed to upload custom image');
    }
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSelectedElement = (key: keyof CertificateElement, val: any) => {
    if (!selectedId) return;
    setElements(prev => prev.map(el => 
      el.id === selectedId ? { ...el, [key]: val } : el
    ));
  };

  // Save full template configuration (Step 1 + Step 2)
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    
    try {
      setLoading(true);
      const payload: Partial<CertificateTemplate> = {
        name: name.trim(),
        bgImageUrl,
        logoUrl: undefined,
        logoConfig: undefined,
        criteria,
        config: elements
      };

      let res;
      if (templateId) {
        res = await certificatesApi.updateTemplate(templateId, payload);
      } else {
        res = await certificatesApi.createTemplate(payload);
      }

      if (res.success && res.data) {
        toast.success(templateId ? 'Template updated successfully' : 'Template created successfully');
        setRefreshKey(prev => prev + 1);
        if (!templateId) {
          router.push(`/admin/certificates/${res.data.id}/edit`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save template configuration');
    } finally {
      setLoading(false);
    }
  };

  const executeIssuance = async (recipientsList: Array<{ menteeId: string; tier: string }>) => {
    try {
      setIssuing(true);
      const res = await certificatesApi.issueCertificates({
        templateId: templateId!,
        recipients: recipientsList
      });
      if (res.success) {
        toast.success(`Successfully enqueued ${recipientsList.length} certificate(s) for rendering!`);
        setSelectedMenteeIds(new Set());
        setRefreshKey(prev => prev + 1);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue certificates');
    } finally {
      setIssuing(false);
    }
  };

  // Issue certificates (Step 3) — uses explicitly selected mentees
  const handleIssue = async () => {
    if (selectedMenteeIds.size === 0) {
      toast.error('Please select at least one mentee to issue certificates');
      return;
    }

    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    const recipients = Array.from(selectedMenteeIds).map(id => ({
      menteeId: id,
      tier: adminTiers[id] ?? defaultTier
    }));

    // Build all active recipients dynamically — no hardcoded tier keys
    const allMentees: any[] = [];
    const seenIds = new Set<string>();
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seenIds.has(m.id)) { seenIds.add(m.id); allMentees.push(m); }
      });
    });
    const allMentors: any[] = qualifiedData.mentors ?? [];
    const allActiveRecipients = [...allMentees, ...allMentors];

    const duplicateInstances = recipients.filter(r => {
      const m = allActiveRecipients.find(item => item.id === r.menteeId);
      return m && m.issuedTiers && m.issuedTiers.includes(r.tier);
    }).map(r => {
      const m = allActiveRecipients.find(item => item.id === r.menteeId);
      return {
        id: r.menteeId,
        name: m ? `${m.firstName} ${m.lastName}` : 'Recipient',
        email: m?.email ?? '',
        tier: getTierName(r.tier)
      };
    });

    if (duplicateInstances.length > 0) {
      setDuplicateWarnState({
        isOpen: true,
        duplicates: duplicateInstances,
        allSelectedRecipients: recipients
      });
    } else {
      await executeIssuance(recipients);
    }
  };

  // Send template to all mentors in the program
  const handleSendToMentors = async () => {
    if (!templateId || !selectedProgramId) return;
    try {
      setSendingToMentors(true);
      const res = await certificatesApi.sendToMentors(templateId, selectedProgramId);
      if (res.success) toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to mentors');
    } finally {
      setSendingToMentors(false);
    }
  };

  // Open Add/Edit Tier dialog
  const openTierModal = (tier?: TierCriteria) => {
    if (tier) {
      setEditingTier(tier);
      setTierModalName(tier.name);
      setTierModalBadgeUrl(tier.badgeUrl || '');
      setTierModalTaskIds(tier.taskIds || []);
    } else {
      setEditingTier(null);
      setTierModalName('');
      setTierModalBadgeUrl('');
      setTierModalTaskIds([]);
    }
    setIsTierModalOpen(true);
  };

  const handleTierBadgeUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingTierBadge(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setTierModalBadgeUrl(res.url);
        toast.success('Badge icon uploaded successfully!');
      }
    } catch (err) {
      toast.error('Failed to upload badge icon');
    } finally {
      setUploadingTierBadge(false);
    }
  };

  const saveTierModal = () => {
    if (!tierModalName.trim()) {
      toast.error('Tier name is required');
      return;
    }

    setCriteria(prev => {
      if (editingTier) {
        // Edit mode
        return prev.map(t => t.id === editingTier.id 
          ? { ...t, name: tierModalName.trim(), badgeUrl: tierModalBadgeUrl, taskIds: tierModalTaskIds }
          : t
        );
      } else {
        // Create mode
        const newTier: TierCriteria = {
          id: `tier-${Date.now()}`,
          name: tierModalName.trim(),
          badgeUrl: tierModalBadgeUrl,
          taskIds: tierModalTaskIds
        };
        return [...prev, newTier];
      }
    });

    setIsTierModalOpen(false);
    toast.success('Certificate type saved! Remeber to click "Save Template" to persist your changes.');
  };

  const deleteTier = (tierId: string) => {
    setCriteria(prev => prev.filter(t => t.id !== tierId));
    toast.success('Certificate type removed.');
  };

  const toggleTierTask = (taskId: string) => {
    setTierModalTaskIds(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const selectedElement = elements.find(el => el.id === selectedId) || null;

  // ─── Recipients derived state (lifted from JSX IIFE anti-pattern) ────────────
  // All lists are memoized so they don't recreate on every render.

  const recipientMenteesList = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    criteria.forEach(c => {
      (qualifiedData[c.id] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee' }); }
      });
    });
    // Pick up any remaining mentees from data keys not covered by current criteria
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee' }); }
      });
    });
    return list;
  }, [criteria, qualifiedData]);

  const recipientMentorsList = useMemo(
    () => (qualifiedData.mentors ?? []).map((m: any) => ({ ...m, role: 'mentor' })),
    [qualifiedData]
  );

  /** Filtered by the current Recipient Type tab (All / Mentees / Mentors). */
  const activeList = useMemo(() => {
    if (recipientType === 'all') return [...recipientMenteesList, ...recipientMentorsList];
    if (recipientType === 'mentees') return recipientMenteesList;
    return recipientMentorsList;
  }, [recipientType, recipientMenteesList, recipientMentorsList]);

  /** Further filtered by the search field. */
  const filtered = useMemo(() => {
    const q = recipientSearch.toLowerCase().trim();
    return q
      ? activeList.filter((m: any) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(q))
      : activeList;
  }, [activeList, recipientSearch]);

  const allFilteredIds = filtered.map((m: any) => m.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedMenteeIds.has(id));

  const selectedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    criteria.forEach(c => { summary[c.id] = 0; });
    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    selectedMenteeIds.forEach(id => {
      const tier = adminTiers[id] ?? defaultTier;
      summary[tier] = (summary[tier] ?? 0) + 1;
    });
    return summary;
  }, [criteria, selectedMenteeIds, adminTiers]);

  const toggleAll = () => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      if (allSelected) allFilteredIds.forEach(id => next.delete(id));
      else allFilteredIds.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleTierChange = (menteeId: string, value: string) => {
    setAdminTiers(prev => ({ ...prev, [menteeId]: value }));
    const mentee = activeList.find((m: any) => m.id === menteeId);
    if (mentee) {
      const match = (mentee as any).tierMatches?.[value] ?? 0;
      setSelectedMenteeIds(prev => {
        const next = new Set(prev);
        if (match >= 90) next.add(menteeId); else next.delete(menteeId);
        return next;
      });
    }
  };

  const bulkSetBadge = (badge: string) => {
    const updatedTiers = { ...adminTiers };
    const nextSelected = new Set(selectedMenteeIds);
    filtered.forEach((m: any) => {
      updatedTiers[m.id] = badge;
      const match = m.tierMatches?.[badge] ?? 0;
      if (match >= 90) nextSelected.add(m.id); else nextSelected.delete(m.id);
    });
    setAdminTiers(updatedTiers);
    setSelectedMenteeIds(nextSelected);
    toast.info(`Set all filtered recipients to ${getTierName(badge)}`);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
        <span className="text-xs text-muted-foreground font-semibold">Loading certificate builder...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 select-none" onMouseUp={handleMouseUp}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cinzel:wght@400;700&family=Great+Vibes&family=Montserrat:wght@400;600;700&family=Oswald:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Sacramento&family=Lustria&family=Merriweather&display=swap');
      ` }} />

      {/* Breadcrumb & Title Header */}
      <div className="flex items-center justify-between pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            <span>Certificates</span>
            <span>&gt;</span>
            <span className="text-brand-500">Create Certificate Cycle</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter Template / Cycle Name..."
              className="text-xl font-extrabold text-foreground bg-transparent border-b border-dashed border-border/80 hover:border-brand-500 focus:border-brand-500 focus:outline-none transition-all pb-1 min-w-[320px] max-w-[500px]"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Create, customize and issue certificates for this fellowship cycle.</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/certificates"
            className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>

          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save Template
          </button>
        </div>
      </div>

      {/* SECTION 1: Certificate Template */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3.5 border-b border-border pb-4">
          <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-sm">
            1
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Certificate Template</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Upload your certificate background and design placement layers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Column: Canvas Preview */}
          <div className="xl:col-span-8 flex flex-col items-center gap-4">
            {/* Zoom controls */}
            <div className="flex items-center gap-2 bg-muted/40 border border-border px-3 py-1.5 rounded-2xl text-[10px] font-bold text-muted-foreground">
              <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-muted text-foreground rounded-lg transition-colors">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="p-1 hover:bg-muted text-foreground rounded-lg transition-colors">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-3 w-px bg-border mx-1" />
              <button type="button" onClick={() => setZoom(1.0)} className="px-1.5 py-0.5 hover:bg-muted text-foreground rounded-lg transition-colors text-[9px]">
                Reset
              </button>
            </div>

            {/* Canvas Outer Wrapper */}
            <div className="w-full bg-muted/30 border border-border rounded-3xl p-6 flex items-center justify-center overflow-auto min-h-[480px]">
              <div
                ref={canvasRef}
                onMouseMove={handleMouseMove}
                style={{
                  width: '848px',
                  height: '600px',
                  backgroundImage: bgImageUrl ? `url('${bgImageUrl}')` : 'none',
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundColor: '#ffffff',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.1s ease-out'
                }}
                className="relative rounded-lg shadow-lg overflow-hidden cursor-default select-none border border-border shrink-0"
              >
                {/* Elements Overlay */}
                {elements.map((el) => {
                  const isSelected = selectedId === el.id;

                  if (el.type === 'badge') {
                    const badgePreview = criteria.find(t => t.badgeUrl)?.badgeUrl || 'https://res.cloudinary.com/djctfho31/image/upload/v1724716800/pathment/placeholders/default-badge.png';
                    return (
                      <div
                        key={el.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedId(el.id);
                          setActiveDragId(el.id);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${el.xPercent}%`,
                          top: `${el.yPercent}%`,
                          width: `${el.widthPercent || 12}%`,
                          transform: 'translate(-50%, -50%)',
                          boxSizing: 'border-box'
                        }}
                        className={`group cursor-move p-1 border transition-all rounded ${
                          isSelected 
                            ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500 shadow-md' 
                            : 'border-transparent hover:border-brand-500/30'
                        }`}
                      >
                        <img src={badgePreview} className="w-full h-auto pointer-events-none" alt="Badge Preview" />
                        <div className="hidden group-hover:flex absolute -top-5 left-1/2 -translate-x-1/2 bg-brand-600 text-[8px] text-white px-1 py-0.5 rounded shadow-sm gap-1 items-center font-bold whitespace-nowrap">
                          <Move className="w-3 h-3" /> Badge Component
                        </div>
                      </div>
                    );
                  }

                  if (el.type === 'image') {
                    return (
                      <div
                        key={el.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedId(el.id);
                          setActiveDragId(el.id);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${el.xPercent}%`,
                          top: `${el.yPercent}%`,
                          width: `${el.widthPercent || 12}%`,
                          transform: 'translate(-50%, -50%)',
                          boxSizing: 'border-box'
                        }}
                        className={`group cursor-move p-1 border transition-all rounded ${
                          isSelected 
                            ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500 shadow-md' 
                            : 'border-transparent hover:border-brand-500/30'
                        }`}
                      >
                        <img src={el.imageUrl} className="w-full h-auto pointer-events-none" alt={el.text} />
                        <div className="hidden group-hover:flex absolute -top-5 left-1/2 -translate-x-1/2 bg-brand-600 text-[8px] text-white px-1 py-0.5 rounded shadow-sm gap-1 items-center font-bold whitespace-nowrap">
                          <Move className="w-3 h-3" /> {el.text}
                        </div>
                      </div>
                    );
                  }

                  const fontSize = el.fontSizePercent * 6;
                  const fontFamily = el.fontStyle || 'Montserrat, sans-serif';

                  return (
                    <div
                      key={el.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(el.id);
                        setActiveDragId(el.id);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${el.xPercent}%`,
                        top: `${el.yPercent}%`,
                        width: '90%',
                        fontFamily,
                        fontSize: `${fontSize}px`,
                        color: el.color || '#1e293b',
                        fontWeight: el.fontWeight || 'normal',
                        textAlign: el.alignment || 'center',
                        transform: 'translate(-50%, -50%)',
                        lineHeight: 1.4,
                        boxSizing: 'border-box'
                      }}
                      className={`cursor-move p-2 border transition-all rounded ${
                        isSelected 
                          ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500' 
                          : 'border-transparent hover:border-brand-500/30 hover:bg-brand-500/2'
                      }`}
                    >
                      {el.type === 'dynamic' ? `{{${el.dynamicKey}}}` : el.text}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Background template paper */}
            <div className="space-y-3 w-full animate-fade-in">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Background template paper</label>
                <span className="text-[9px] font-bold text-brand-600 bg-brand-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider select-none">Design Setup</span>
              </div>
              
              {/* Presets Trigger Button */}
              <div className="w-full">
                <button
                  type="button"
                  onClick={() => setIsPresetsDrawerOpen(true)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activePresetId 
                      ? 'border-brand-500 bg-brand-500/5 text-brand-700' 
                      : 'border-border bg-background hover:bg-muted/40 text-foreground'
                  }`}
                >
                  <Award className="w-3.5 h-3.5 text-brand-500" />
                  {activePresetId 
                    ? BACKGROUND_PRESETS.find(p => p.id === activePresetId)?.name || 'Preset Selected'
                    : 'Browse Presets & Custom Backgrounds'
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Variables Helper & Layer Customizations */}
          <div className="xl:col-span-4 space-y-5">
            {/* Template Variables Shortcuts */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3.5 shadow-2xs">
              <div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Variables</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Click variables tags below to add them to certificate.</p>
              </div>

              <div className="flex flex-col gap-2">
                {DYNAMIC_SHORTCUTS.map(shortcut => {
                  const alreadyAdded = elements.some(el => el.dynamicKey === shortcut.key);
                  return (
                    <button
                      key={shortcut.key}
                      type="button"
                      onClick={() => addVariableElement(shortcut.key, shortcut.label)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all text-left ${
                        alreadyAdded 
                          ? 'border-brand-500 bg-brand-500/5 text-brand-600' 
                          : 'border-border bg-background hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      <span>{shortcut.label}</span>
                      <span className="font-mono text-[9px] bg-muted px-1.5 py-0.5 rounded border border-border/40">{shortcut.tag}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={addStaticTextElement}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                >
                  <Type className="w-3.5 h-3.5" /> Static Text
                </button>

                <button
                  type="button"
                  onClick={addBadgeElement}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                >
                  <Award className="w-3.5 h-3.5" /> Dynamic Badge
                </button>

                <button
                  type="button"
                  onClick={addPathmentLogoElement}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-brand-500" /> Pathment Logo
                </button>

                <FileDragDrop onFilesSelected={handleCustomImageUpload} accept="image/*" multiple={false}>
                  {({ openFilePicker }) => (
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> Custom Image
                    </button>
                  )}
                </FileDragDrop>
              </div>
            </div>

            {/* Selected Element Customization Panel */}
            {selectedElement ? (
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Layer Settings</h3>
                  <button
                    type="button"
                    onClick={() => deleteElement(selectedElement.id)}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {selectedElement.type === 'static' ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Text Content</label>
                    <textarea
                      rows={2}
                      value={selectedElement.text}
                      onChange={e => updateSelectedElement('text', e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                ) : (selectedElement.type === 'badge' || selectedElement.type === 'image') ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Image Width: {selectedElement.widthPercent || 15}%</label>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={selectedElement.widthPercent || 15}
                      onChange={e => updateSelectedElement('widthPercent', Number(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Dynamic Variable</label>
                    <div className="text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-3 py-2 rounded-xl mt-1 border border-brand-500/20">
                      {selectedElement.dynamicKey}
                    </div>
                  </div>
                )}

                {(selectedElement.type !== 'badge' && selectedElement.type !== 'image') && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Font Family</label>
                      <select
                        value={selectedElement.fontStyle || 'sans'}
                        onChange={e => updateSelectedElement('fontStyle', e.target.value)}
                        className="w-full px-3 py-2 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none"
                      >
                        {FONTS.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Size: {selectedElement.fontSizePercent}%</label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.1"
                          value={selectedElement.fontSizePercent}
                          onChange={e => updateSelectedElement('fontSizePercent', Number(e.target.value))}
                          className="w-full accent-brand-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Weight</label>
                        <button
                          type="button"
                          onClick={() => updateSelectedElement('fontWeight', selectedElement.fontWeight === 'bold' ? 'normal' : 'bold')}
                          className={`w-full py-1.5 border border-border rounded-xl text-xs transition-colors flex items-center justify-center ${
                            selectedElement.fontWeight === 'bold'
                              ? 'bg-brand-500/10 border-brand-500 text-brand-600 font-bold'
                              : 'bg-muted hover:bg-muted/70 text-foreground'
                          }`}
                        >
                          <Bold className="w-4 h-4 mr-1" /> Bold
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Alignment</label>
                        <div className="flex bg-muted p-0.5 rounded-xl border border-border">
                          {(['left', 'center', 'right'] as const).map(align => {
                            const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                            return (
                              <button
                                key={align}
                                type="button"
                                onClick={() => updateSelectedElement('alignment', align)}
                                className={`flex-1 py-1 flex items-center justify-center rounded-lg transition-colors ${
                                  selectedElement.alignment === align
                                    ? 'bg-card text-foreground shadow-2xs font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Color</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={selectedElement.color || '#000000'}
                            onChange={e => updateSelectedElement('color', e.target.value)}
                            className="w-10 h-8 p-0 bg-transparent border-0 cursor-pointer rounded-lg overflow-hidden"
                          />
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">{selectedElement.color || '#000000'}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-xs shadow-2xs">
                Click on any layer inside the workspace to customize its font family, size, color, alignments and options.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: Certificate Criteria */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-sm">
              2
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Certificate Criteria</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Define rules and link task checklist requirements to qualify mentees for each certificate type.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openTierModal()}
            className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline bg-brand-500/5 hover:bg-brand-500/10 px-3.5 py-2 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" /> Add Certificate Type
          </button>
        </div>

        {/* Criteria Table */}
        <div className="border border-border rounded-2xl overflow-hidden bg-muted/10 divide-y divide-border">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-4">Certificate Type</div>
            <div className="col-span-6">Criteria Summary</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Table Body */}
          {criteria.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground font-semibold">
              No certificate criteria types configured. Click "+ Add Certificate Type" to begin.
            </div>
          ) : (
            criteria.map(tier => {
              // Build criteria summary text
              let summaryText = 'Active mentees during the fellowship';
              if (tier.taskIds && tier.taskIds.length > 0) {
                const count = tier.taskIds.length;
                const taskTitles = tier.taskIds
                  .map(id => availableTasks.find(t => t.id === id)?.title)
                  .filter(Boolean);
                summaryText = `${count} required task${count > 1 ? 's' : ''} (${taskTitles.slice(0, 2).join(', ')}${taskTitles.length > 2 ? '...' : ''})`;
              }

              return (
                <div key={tier.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center text-xs font-semibold text-foreground bg-card hover:bg-muted/10 transition-colors">
                  <div className="col-span-4 flex items-center gap-2">
                    {tier.badgeUrl ? (
                      <img src={tier.badgeUrl} className="w-7 h-7 object-contain rounded-md" alt={tier.name} />
                    ) : (
                      <div className="w-7 h-7 rounded-md bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-[10px]">
                        {tier.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="font-bold text-foreground">{tier.name}</span>
                  </div>

                  <div className="col-span-6 text-muted-foreground text-[11px] font-medium leading-relaxed">
                    {summaryText}
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => openTierModal(tier)}
                      className="p-1 text-muted-foreground hover:text-brand-500 hover:bg-muted rounded transition-colors"
                      title="Edit Criteria"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTier(tier.id)}
                      className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Delete Tier"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* SECTION 3: Select Recipients & Issue */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-sm">3</div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Select Recipients</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Filter mentees who meet criteria and issue credentials.</p>
            </div>
          </div>
          {templateId && selectedProgramId && (
            <button
              type="button"
              onClick={handleSendToMentors}
              disabled={sendingToMentors}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
            >
              {sendingToMentors ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              Send to Mentors
            </button>
          )}
        </div>

        {!templateId ? (
          <div className="bg-muted/20 border border-border p-6 rounded-2xl text-center text-xs text-muted-foreground font-semibold">
            Please click <span className="text-brand-600 font-bold">"Save Template"</span> at the top first to enable live cohort matching and certificate issuance.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Recipient Type Tabs & Rules */}
            <div className="flex items-center justify-between border-b border-border -mx-6 px-6 pb-px mb-2">
              <div className="flex gap-4">
                {(['all', 'mentees', 'mentors'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setRecipientType(type); setSelectedMenteeIds(new Set()); setRecipientSearch(''); }}
                    className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${
                      recipientType === type
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {type === 'all'
                      ? `All (${recipientMenteesList.length + recipientMentorsList.length})`
                      : type === 'mentees'
                      ? `Mentees (${recipientMenteesList.length})`
                      : `Mentors (${recipientMentorsList.length})`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsRulesDrawerOpen(true)}
                className="flex items-center gap-1.5 pb-2.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all"
              >
                <Info className="w-3.5 h-3.5 text-brand-500" />
                View Rules
              </button>
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Cohort / Program</label>
                <select
                  value={selectedProgramId}
                  onChange={e => setSelectedProgramId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none cursor-pointer"
                >
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={recipientSearch}
                    onChange={e => setRecipientSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-8 pr-3.5 py-2.5 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Actions */}
            {filtered.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap bg-muted/20 border border-border rounded-2xl p-3 text-xs">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Set All to:</span>
                {criteria.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => bulkSetBadge(c.id)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border animate-fade-in ${getTierButtonColor(c.id)}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* Mentee / Mentor table */}
            {loadingQualifications ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground font-semibold">
                No active {recipientType} found in this program.
              </div>
            ) : (
              <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider items-center">
                  <div className="col-span-1 flex items-center justify-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 accent-brand-600 cursor-pointer" />
                  </div>
                  <div className="col-span-3">
                    {recipientType === 'all' ? 'Recipient' : recipientType === 'mentees' ? 'Mentee' : 'Mentor'}
                  </div>
                  <div className="col-span-3 text-center">Certificate Badge</div>
                  <div className="col-span-3 text-center">Issued Badges</div>
                  <div className="col-span-2 text-center">Eligibility</div>
                </div>

                {/* Table rows */}
                <div className="max-h-[340px] overflow-y-auto divide-y divide-border">
                  {filtered.map((m: any) => {
                    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
                    const selectedTier = adminTiers[m.id] ?? defaultTier;
                    const match = m.tierMatches?.[selectedTier] ?? 0;
                    const matchColor = match === 100
                      ? 'text-emerald-600 bg-emerald-500/10'
                      : match >= 50
                      ? 'text-amber-600 bg-amber-500/10'
                      : 'text-red-500 bg-red-500/10';
                    const issuedTiersList: string[] = m.issuedTiers ?? [];

                    return (
                      <div key={m.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-xs hover:bg-muted/10 transition-colors">
                        <div className="col-span-1 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedMenteeIds.has(m.id)}
                            onChange={() => toggleOne(m.id)}
                            className="w-3.5 h-3.5 accent-brand-600 cursor-pointer"
                          />
                        </div>
                        <div className="col-span-3 min-w-0">
                          <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{m.firstName} {m.lastName}</span>
                            {recipientType === 'all' && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                                m.role === 'mentor'
                                  ? 'bg-indigo-500/10 text-indigo-600'
                                  : 'bg-brand-500/10 text-brand-600'
                              }`}>
                                {m.role}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <select
                            value={selectedTier}
                            onChange={e => handleTierChange(m.id, e.target.value)}
                            className="px-2 py-0.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none cursor-pointer font-bold max-w-[160px]"
                          >
                            {criteria.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3 flex flex-wrap justify-center gap-1">
                          {issuedTiersList.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground/60 font-semibold">—</span>
                          ) : (
                            issuedTiersList.map(tier => (
                              <span
                                key={tier}
                                className={`px-1.5 py-0.5 rounded border text-[9px] font-extrabold uppercase tracking-wide ${getTierBadgeColor(tier)}`}
                              >
                                {getTierName(tier)}
                              </span>
                            ))
                          )}
                        </div>
                        <div className="col-span-2 flex items-center justify-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${matchColor}`}>
                            {match}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selection Summary badges rollup */}
            {selectedMenteeIds.size > 0 && (
              <div className="bg-muted/20 border border-border rounded-2xl p-4 flex flex-wrap gap-4 text-xs font-semibold text-muted-foreground">
                {criteria.map(c => (
                  <div key={c.id} className="flex items-center gap-1">
                    <Award className={`w-3.5 h-3.5 ${getTierIconColor(c.id)}`} />
                    <span>{c.name}: </span>
                    <span className="font-bold text-foreground">{selectedSummary[c.id] ?? 0}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer: selection count + issue button */}
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <Users className="w-4 h-4 text-brand-500" />
                <span>
                  <span className="text-foreground font-extrabold">{selectedMenteeIds.size}</span>{' '}
                  {recipientType === 'all'
                    ? `recipient${selectedMenteeIds.size !== 1 ? 's' : ''}`
                    : recipientType === 'mentees'
                    ? `mentee${selectedMenteeIds.size !== 1 ? 's' : ''}`
                    : `mentor${selectedMenteeIds.size !== 1 ? 's' : ''}`}{' '}
                  selected
                </span>
              </div>
              <button
                type="button"
                onClick={handleIssue}
                disabled={issuing || selectedMenteeIds.size === 0}
                className="flex items-center gap-1.5 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-sm transition-all"
              >
                {issuing ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Award className="w-3.5 h-3.5" />}
                Issue Certificates
              </button>
            </div>
          </div>
        )}
      
      </div>

      {/* SECTION 4: Issuance History */}
      {templateId && (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
          <div className="border-b border-border pb-4">
            <h2 className="text-sm font-bold text-foreground">Issuance History & Logs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Track, regenerate/resend, and revoke/delete issued certificate credentials.</p>
          </div>
          <CertificateHistoryLog templateId={templateId} userRole="admin" />
        </div>
      )}

      {/* TIER CREATION / EDITING MODAL DIALOG */}
      {isTierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Award className="w-4.5 h-4.5 text-brand-500" />
                {editingTier ? `Edit Certificate Type: ${editingTier.name}` : 'Add Certificate Type'}
              </h3>
              <button onClick={() => setIsTierModalOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Certificate Type Name</label>
                <input
                  type="text"
                  placeholder="e.g. Gold Certificate, Best Performance"
                  value={tierModalName}
                  onChange={e => setTierModalName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none"
                />
              </div>

              {/* Badge Uploader */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  Upload Badge Icon
                </label>
                <FileDragDrop onFilesSelected={handleTierBadgeUpload} accept="image/*" multiple={false} disabled={uploadingTierBadge}>
                  {({ openFilePicker }) => (
                    <div onClick={openFilePicker} className="border border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center bg-background hover:bg-muted/40 cursor-pointer text-xs font-semibold">
                      {uploadingTierBadge ? (
                        <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
                      ) : tierModalBadgeUrl ? (
                        <div className="flex flex-col items-center gap-1 text-center">
                          <img src={tierModalBadgeUrl} className="w-10 h-10 object-contain rounded" alt="Badge" />
                          <span className="text-[10px] text-brand-600 font-bold">Badge uploaded ✓</span>
                          <span className="text-[9px] text-muted-foreground">Click to replace</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-center text-muted-foreground">
                          <ImageIcon className="w-5 h-5" />
                          <span>Click to upload badge image</span>
                          <span className="text-[9px] text-muted-foreground/60">Fitted square icon</span>
                        </div>
                      )}
                    </div>
                  )}
                </FileDragDrop>
              </div>

              {/* Required Tasks list checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-muted-foreground">Select Required Cohort Tasks</label>
                  {availableTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (tierModalTaskIds.length === availableTasks.length) {
                          setTierModalTaskIds([]);
                        } else {
                          setTierModalTaskIds(availableTasks.map(t => t.id));
                        }
                      }}
                      className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {tierModalTaskIds.length === availableTasks.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                <div className="border border-border rounded-xl bg-muted/20 p-3 max-h-[160px] overflow-y-auto space-y-1.5">
                  {availableTasks.length === 0 ? (
                    <div className="text-center text-[10px] text-muted-foreground italic py-4">
                      No roadmap tasks found in library.
                    </div>
                  ) : (
                    availableTasks.map(task => {
                      const checked = tierModalTaskIds.includes(task.id);
                      return (
                        <label key={task.id} className="flex items-center gap-2 text-[10px] cursor-pointer hover:bg-muted/40 p-1.5 rounded text-foreground font-semibold">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTierTask(task.id)}
                            className="rounded border-border text-brand-500 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="line-clamp-1">{task.title}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted/20 border-t border-border flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTierModalOpen(false)}
                className="px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTierModal}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-sm"
              >
                Save Certificate Type
              </button>
            </div>
          </div>
        </div>
      )}
      <Drawer
        open={isRulesDrawerOpen}
        onClose={() => setIsRulesDrawerOpen(false)}
        title="Certificate Criteria & Rules"
        subtitle={`Requirements configured for the template: ${name || 'New Template'}`}
        width="md"
      >
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The rules below determine which badge tier a mentee qualifies for. If a mentee completes the required roadmap tasks, they will become eligible to receive the corresponding badge.
          </p>

          <div className="space-y-4">
            {criteria.map((c: any) => {
              const iconColor = getTierIconColor(c.id);
              const isParticipation = c.id === 'participation';
              const taskList = c.taskIds || [];
              const resolvedTasks = taskList
                .map((id: string) => criteriaTasks.find(t => t.id === id)?.title)
                .filter(Boolean);

              return (
                <div key={c.id} className="p-4 rounded-2xl border border-border bg-card shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                    <Award className={`w-5 h-5 ${iconColor}`} />
                    <span className="text-xs font-bold text-foreground">{c.name}</span>
                  </div>

                  <div className="space-y-2">
                    {isParticipation ? (
                      <p className="text-xs text-muted-foreground font-semibold italic">
                        Participation Certificate - Requires no tasks (awarded to all active participants by default).
                      </p>
                    ) : taskList.length === 0 ? (
                      <p className="text-xs text-red-500 font-semibold italic">
                        No required tasks have been configured for this tier.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-foreground">
                          Requires completing <span className="text-brand-600 font-extrabold">{taskList.length}</span> task{taskList.length !== 1 ? 's' : ''}:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground pl-1">
                          {resolvedTasks.length > 0 ? (
                            resolvedTasks.map((title: string, index: number) => (
                              <li key={index} className="leading-relaxed">
                                {title}
                              </li>
                            ))
                          ) : (
                            taskList.map((id: string) => (
                              <li key={id} className="leading-relaxed font-mono text-[9px] text-muted-foreground/60">
                                Task ID: {id}
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Drawer>

      <DuplicateWarnModal
        isOpen={duplicateWarnState.isOpen}
        duplicates={duplicateWarnState.duplicates}
        onCancel={() => setDuplicateWarnState(prev => ({ ...prev, isOpen: false }))}
        onIssueAnyway={async () => {
          const allSelected = duplicateWarnState.allSelectedRecipients;
          setDuplicateWarnState(prev => ({ ...prev, isOpen: false }));
          await executeIssuance(allSelected);
        }}
        onSkipDuplicates={async () => {
          const dupIds = new Set(duplicateWarnState.duplicates.map(d => d.id));
          const cleanRecipients = duplicateWarnState.allSelectedRecipients.filter(r => !dupIds.has(r.menteeId));
          setDuplicateWarnState(prev => ({ ...prev, isOpen: false }));
          if (cleanRecipients.length === 0) {
            toast.info('No remaining recipients left after skipping duplicates.');
            return;
          }
          await executeIssuance(cleanRecipients);
        }}
      />
      
      <Drawer
        open={isPresetsDrawerOpen}
        onClose={() => setIsPresetsDrawerOpen(false)}
        title="Premium Certificate Background Presets"
        subtitle="Choose from a collection of professionally-designed layouts. Selecting one will apply it to your editor canvas instantly."
        width="lg"
      >
        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Custom Background Uploaded/Dropzone Card */}
          {(() => {
            const hasCustomImage = bgImageUrl && !bgImageUrl.startsWith('data:image/svg+xml;base64,');
            const isCustomActive = !activePresetId && hasCustomImage;
            
            if (hasCustomImage) {
              return (
                <div
                  className={`group relative flex flex-col p-2.5 rounded-2xl border transition-all text-left w-full bg-card hover:shadow-md ${
                    isCustomActive 
                      ? 'border-brand-500 ring-2 ring-brand-500/15 scale-[1.01]' 
                      : 'border-border hover:border-brand-500/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActivePresetId(null);
                      toast.success('Applied custom background image!');
                    }}
                    className="w-full flex flex-col items-start focus:outline-none flex-1"
                  >
                    {/* Image Preview */}
                    <div className="w-full aspect-[1.414] rounded-xl overflow-hidden border border-border bg-muted/30 relative flex items-center justify-center">
                      <img 
                        src={bgImageUrl} 
                        className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-[1.03]" 
                        alt="Custom background" 
                      />
                      {isCustomActive && (
                        <div className="absolute top-2 right-2 w-5.5 h-5.5 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm border border-white">
                          <CheckCircle className="w-3.5 h-3.5 stroke-[3px]" />
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 px-1 flex-1 flex flex-col justify-between w-full">
                      <div>
                        <span className="text-[11px] font-bold text-foreground group-hover:text-brand-600 transition-colors">
                          Custom Uploaded Design
                        </span>
                        <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          Your custom uploaded background image applied to this template.
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Actions & Replace File Button */}
                  <div className="mt-3 flex items-center justify-between w-full border-t border-border/40 pt-2 shrink-0">
                    {isCustomActive ? (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full uppercase tracking-wider select-none">
                        Applied Design
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActivePresetId(null);
                          toast.success('Applied custom background image!');
                        }}
                        className="inline-flex items-center gap-1 text-[8px] font-bold text-muted-foreground bg-muted/60 group-hover:bg-brand-500 group-hover:text-white px-2 py-1 rounded-full uppercase tracking-wider transition-all"
                      >
                        Apply Custom
                      </button>
                    )}

                    <FileDragDrop onFilesSelected={handleBgUpload} accept="image/*" multiple={false} disabled={uploadingBg}>
                      {({ openFilePicker }) => (
                        <button
                          type="button"
                          onClick={openFilePicker}
                          className="text-[9px] font-extrabold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
                        >
                          Replace Image
                        </button>
                      )}
                    </FileDragDrop>
                  </div>
                </div>
              );
            }

            // No custom image uploaded yet - show file dropzone card
            return (
              <FileDragDrop onFilesSelected={handleBgUpload} accept="image/*" multiple={false} disabled={uploadingBg}>
                {({ openFilePicker }) => (
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="group relative flex flex-col p-2.5 rounded-2xl border border-dashed border-border hover:border-brand-500/40 bg-muted/10 hover:bg-muted/20 transition-all text-left w-full h-full min-h-[175px]"
                  >
                    <div className="w-full aspect-[1.414] rounded-xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                      {uploadingBg ? (
                        <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-brand-500 group-hover:scale-115 transition-transform" />
                      )}
                      <span className="text-[10px] font-bold text-foreground">Upload Custom File</span>
                      <span className="text-[8px] text-muted-foreground">PNG, JPG, SVG</span>
                    </div>
                    <div className="mt-3.5 px-1">
                      <span className="text-[11px] font-bold text-foreground">Add Custom Design</span>
                      <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">
                        Upload your own background layout image.
                      </p>
                    </div>
                  </button>
                )}
              </FileDragDrop>
            );
          })()}

          {BACKGROUND_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  applyPresetBackground(preset.id, preset.svg);
                }}
                className={`group relative flex flex-col p-2.5 rounded-2xl border transition-all text-left w-full bg-card hover:shadow-md ${
                  isActive 
                    ? 'border-brand-500 ring-2 ring-brand-500/15 scale-[1.01]' 
                    : 'border-border hover:border-brand-500/30'
                }`}
              >
                {/* Scaled Mini SVG Preview */}
                <div className="w-full aspect-[1.414] rounded-xl overflow-hidden border border-border bg-muted/30 relative flex items-center justify-center">
                  <div 
                    className="w-full h-full pointer-events-none transition-transform duration-300 group-hover:scale-[1.03]"
                    dangerouslySetInnerHTML={{ __html: preset.svg }}
                  />
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5.5 h-5.5 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm border border-white">
                      <CheckCircle className="w-3.5 h-3.5 stroke-[3px]" />
                    </div>
                  )}
                </div>
                
                <div className="mt-3 px-1 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-foreground group-hover:text-brand-600 transition-colors">
                      {preset.name}
                    </span>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                      {preset.description}
                    </p>
                  </div>
                  
                  {/* Status Button at the bottom */}
                  <div className="mt-3">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full uppercase tracking-wider">
                        Applied Design
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-muted-foreground bg-muted/60 group-hover:bg-brand-500 group-hover:text-white px-2 py-1 rounded-full uppercase tracking-wider transition-all">
                        Apply Preset
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Drawer>
    </div>
  );
}
