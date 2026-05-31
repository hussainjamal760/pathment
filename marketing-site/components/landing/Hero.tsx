import { Check, GitBranch, LayoutDashboard, LineChart, Sparkles, Trophy, Users } from 'lucide-react';
import { heroHighlights } from './content';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-zinc-200/60 bg-[#fcfcfd] pt-16 pb-24 md:pt-20 md:pb-32">
      <div className="grid-pattern pointer-events-none absolute inset-0 opacity-45" />
      <div className="pointer-events-none absolute top-0 left-1/2 h-full w-full max-w-7xl -translate-x-1/2">
        <div className="h-full w-full border-x border-zinc-100" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800">
            <span className="flex h-1.5 w-1.5 rounded-full bg-brand-500" />
            AI-POWERED MENTORSHIP INFRASTRUCTURE
          </div>
          <h1 className="mb-6 text-balance font-display text-4xl leading-[1.08] font-semibold tracking-tight text-zinc-950 sm:text-6xl">
            Structured growth, <br className="hidden sm:inline" />
            <span className="font-normal italic text-zinc-500">at enterprise scale.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-zinc-600">
            Pathment gives engineering &amp; product teams a rigorous system for competency
            development through smart mentor matching, AI-generated roadmaps, and gamified,
            verifiable progress.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#request-access"
              className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-md-soft transition-all hover:bg-zinc-800 sm:w-auto"
            >
              Request Access
            </a>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-50 hover:text-zinc-950 sm:w-auto"
            >
              See How It Works
            </a>
          </div>

          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-2.5">
            {heroHighlights.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm-soft"
              >
                <Check className="h-3.5 w-3.5 text-brand-600" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl rounded-xl border border-zinc-200/80 bg-white p-2.5 shadow-lg-soft">
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            <div className="flex items-center justify-between border-b border-zinc-200/80 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
                <span className="ml-2 font-mono text-xs text-zinc-400">
                  acme.pathment.me/analytics
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded border border-brand-100 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
                <Sparkles className="h-3 w-3" /> AI ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-1 divide-y divide-zinc-200 md:grid-cols-4 md:divide-x md:divide-y-0">
              <div className="space-y-4 bg-white p-4 text-xs font-medium text-zinc-500">
                <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Navigation
                </div>
                <div className="space-y-1">
                  <span className="flex items-center gap-2 rounded bg-zinc-100 px-2 py-1.5 text-zinc-900">
                    <LayoutDashboard className="h-3.5 w-3.5 text-zinc-600" /> Program Overview
                  </span>
                  <span className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-zinc-50 hover:text-zinc-900">
                    <Users className="h-3.5 w-3.5" /> Active Cohorts
                  </span>
                  <span className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-zinc-50 hover:text-zinc-900">
                    <GitBranch className="h-3.5 w-3.5" /> Skill Blueprints
                  </span>
                  <span className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-zinc-50 hover:text-zinc-900">
                    <LineChart className="h-3.5 w-3.5" /> Progress Analytics
                  </span>
                  <span className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-zinc-50 hover:text-zinc-900">
                    <Trophy className="h-3.5 w-3.5" /> Leaderboard
                  </span>
                </div>
              </div>

              <div className="space-y-6 bg-[#fcfcfd] p-6 md:col-span-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-zinc-900">
                      Engineering Mentorship Cohort 4
                    </h4>
                    <p className="text-xs text-zinc-500">
                      System status: 124 active developer pathways mapped
                    </p>
                  </div>
                  <span className="rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-500">
                    Q3 Performance Roadmap
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Active Pairs
                    </div>
                    <div className="mt-1 text-xl font-semibold text-zinc-900">58 Pairs</div>
                    <div className="mt-0.5 text-[10px] font-medium text-emerald-600">
                      &uarr; 12% vs last month
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Milestone Completion
                    </div>
                    <div className="mt-1 text-xl font-semibold text-zinc-900">91.4%</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Target trajectory met</div>
                  </div>
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Avg. Feedback Speed
                    </div>
                    <div className="mt-1 text-xl font-semibold text-zinc-900">2.4 Hrs</div>
                    <div className="mt-0.5 text-[10px] font-medium text-emerald-600">
                      &darr; 4.2h since setup
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200/80 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-800">
                      Progression Path: Staff Engineer (L6) Prep
                    </span>
                    <span className="text-[11px] text-zinc-400">4 Milestones</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 font-mono text-xs text-zinc-400">M1</span>
                      <div className="w-32 truncate text-xs font-medium text-zinc-800">
                        Architecture Blueprint
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-zinc-800" style={{ width: '100%' }} />
                      </div>
                      <span className="w-12 text-right font-mono text-xs font-medium text-emerald-600">
                        100% Done
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-8 font-mono text-xs text-zinc-400">M2</span>
                      <div className="w-32 truncate text-xs font-medium text-zinc-800">
                        Cross-team Governance
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-zinc-800" style={{ width: '78%' }} />
                      </div>
                      <span className="w-12 text-right font-mono text-xs font-medium text-zinc-600">
                        78% Active
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-8 font-mono text-xs text-zinc-400">M3</span>
                      <div className="w-32 truncate text-xs font-medium text-zinc-800">
                        Strategic Delivery
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-zinc-300" style={{ width: '30%' }} />
                      </div>
                      <span className="w-12 text-right font-mono text-xs text-zinc-400">
                        30% Active
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200/80 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                      <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                      Suggested action
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">2m ago</span>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    4 pairs finished{' '}
                    <span className="font-medium text-zinc-900">Architecture Blueprint</span> ahead
                    of schedule. Unlock{' '}
                    <span className="font-medium text-zinc-900">M2 · Cross-team Governance</span> for
                    them?
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                      Unlock M2
                    </span>
                    <span className="rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                      Dismiss
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
