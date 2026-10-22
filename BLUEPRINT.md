# Ayaale Hub — Product & Development Blueprint

Version 1.0 | 22 October 2026

## Vision
Ayaale Hub is a central workspace to capture ideas, organize projects, plan milestones, and eventually manage the Ayaale family of products. The initial scope is **homepage only**. The interface should communicate momentum without implying mock progress is real.

## Ayaale ecosystem
- Ayaale Travel — destinations and itinerary planning
- Ayaale Offers — travel, hotel and dining offers
- Ayaale Stays — accommodation discovery
- Ayaale Foods — food discovery
- Ayaale Tech — technology products
- Ayaale Hub — umbrella dashboard and planning workspace

All project names, progress indicators, and sample milestones in the prototype are illustrative and editable later.

## Users and outcomes
Initial user: solo founder/administrator. Key jobs: see all projects at a glance; capture ideas quickly; find and revisit projects; identify what to build next. Future: collaborators, project-specific permissions, research, finances, and AI-assisted planning.

## Homepage information architecture
1. Sidebar: Ayaale brand, Overview, My Projects, Idea Vault, Roadmap, Research, Resources, profile/setting placeholder.
2. Topbar: breadcrumb, search, Add Idea, notifications placeholder.
3. Introduction: greeting and purple hero panel with CTA.
4. Four summary metrics: Total Projects, Active Projects, Ideas Captured, Upcoming Goals.
5. Project grid: icon, name, short description, status, indicative progress.
6. Idea Vault preview: recent entries, category, short description, Add Idea.
7. What's Next: milestones/timeline.
8. Responsive treatment: collapsible sidebar/compact navigation; cards wrap; keyboard operability.

## Phase 1 — Homepage MVP (in scope)
- Responsive homepage faithful to accompanying `prototype.html`.
- Typed mock data for projects, ideas, and goals.
- Add Idea dialog: title required, category, optional description, validations, immediate UI update. Demo may use local state; label as non-persistent.
- Client-side search/filter for project names/descriptions and idea titles/categories.
- Derived counts rather than contradictory hardcoded totals.
- Empty-state feedback.
- Accessible semantic buttons, labels, focus, and keyboard interactions.
- Sidebar items beyond Overview must be visibly marked coming soon or inactivated. No fictitious pages.

## Out of scope for Phase 1
Authentication, databases, public listings, payments, AI, multi-tenant organizations, integrations, permanent persistence, production analytics. Do not prematurely build the rest of the application.

## Visual design tokens
- Primary purple `#6555E8`; primary hover `#5143CE`
- Canvas `#F7F8FB`; surface `#FFFFFF`; text `#202638`; muted `#8991A3`; border `#E7EAF1`
- Hero gradient `#4C3AC5` to `#A18DFA`
- Typeface Inter/system sans; 8px spacing rhythm; 12–16px corners; restrained shadow.
- Note: Purple is the working mockup's accent and can be changed to Ayaale brand colors later.

## Sample data contracts
```ts
type ProjectStatus = 'concept' | 'planning' | 'in_progress' | 'launched' | 'paused';
interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: ProjectStatus;
  progressPercent?: number; // demo value only until linked to milestones
}
type IdeaCategory = 'Business' | 'Travel' | 'Food' | 'Technology' | 'Other';
interface Idea {
  id: string;
  title: string;
  description?: string;
  category: IdeaCategory;
  createdAt: string;
}
interface Milestone {
  id: string;
  title: string;
  details?: string;
  projectId?: string;
  status: 'todo' | 'in_progress' | 'done';
  dueDate?: string;
}
```

## Acceptance criteria
- Homepage renders at desktop (1440px), tablet (768px), and mobile (390px) without overflow.
- All visible actions either work or clearly indicate "Coming soon".
- Add Idea dialog validates an empty title, closes with Escape, and returns focus appropriately.
- New idea appears in the preview, Idea count updates, and search finds it.
- Project count matches mock projects; Active count follows status.
- Screen-reader labels and focus indicators present.
- No secrets, database requirements, or external paid services to preview.
- `npm run lint`, TypeScript check, and production build pass.

## Suggested implementation
Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui + Lucide. Mock data under `src/data`, shared types under `src/types`, reusable components in `src/components`. Later connect Supabase Auth/Postgres with Row Level Security for each user's projects and ideas. Host on Vercel or Render, deploy from GitHub.

## Phased roadmap
1. **Homepage** — visual foundation and working local interactions.
2. **Idea Vault** — CRUD, prioritization, tags, idea-to-project conversion, persisted storage.
3. **Projects & Roadmap** — project detail views, milestones, tasks, progress derived from completion.
4. **Planning tools** — research, budgets, launch checklists, links, notes.
5. **Collaboration & AI** — invites/roles and optional idea analysis.

## How to hand off to Codex
Place `BLUEPRINT.md` and `prototype.html` at the repository root. Then instruct Codex:

> Implement **Phase 1 homepage only** based on BLUEPRINT.md. Use prototype.html as the visual and interaction reference, but rebuild it as reusable Next.js/TypeScript components with Tailwind/shadcn/ui. Do not simply iframe the HTML. Use mock data and client state. Ensure responsive, accessible functionality; provide README and run lint/build checks. Do not add authentication or a backend yet.

## Prototype ownership and limitation
`prototype.html` is a **portable approximation of the homepage mockup in chat**, not a published online URL. Open it locally to preview or commit it to a repository for sharing. The prototype is static/demo code and stores new ideas only in the current browser session.
