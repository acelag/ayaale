# T002 — Design system

## Direction

A calm, text-first discovery experience: warm neutral surfaces, deep green actions, restrained gold highlights and compact horizontal offer cards. Useful pricing and conditions take priority over decoration. This is the initial design baseline, not a logo or a finished page. Light theme only at launch; do not render an untested automatic dark theme.

[Token source](../design/tokens.css) defines framework-independent CSS values. T003 will import these and map them to the installed Tailwind and shadcn/ui versions. Tokens alone do not supply component behavior or accessibility.

## Color and visual states

Use background/foreground for page content, card/card-foreground for raised surfaces, primary/primary-foreground for the main action, secondary for quieter controls, muted for supporting content, accent for limited highlights, destructive for errors, success for positive status and warning for attention. Always pair status color with readable text and an icon where useful. Never communicate status through color alone.

Use muted-foreground only on background, card or muted surfaces. Use the input token for control outlines and border for decorative separators; the lighter border is not an accessible control boundary by itself. Link text uses primary with an underline. Focus uses a 3px ring with a 2px background-colored offset; use a white inner offset on green buttons so the ring remains distinct. Focus rings must not be clipped. Disabled controls use explicit disabled state, no hover treatment and adjacent explanation when the reason matters. Loading retains the control label and dimensions.

Use 6px corners for small controls, 12px for cards and 16px for dialogs/sheets. Shadows are subtle; avoid shadows on every row. Do not place text directly over photographs without an independently tested contrast surface.

## Typography and spacing

Use the local system sans stack with no third-party font requests. Body and form inputs are 16px with 1.5 line height; supporting text 14px, nonessential captions 12px. Page headings scale from 24px to 32px, section headings 20–24px, card titles 16–18px. Use 400/500/600/700 weights and sentence case. Prices use tabular numbers and remain prominent. Avoid all-capital paragraphs and fixed-height text boxes.

Use the 4px spacing scale in the token file. Page gutters are 16px below 640px, 24px from 640px and 32px from 1024px. Content is centered at a maximum 1200px; long prose is limited to 672px. Touch controls are at least 44×44 CSS pixels, including icon-only buttons. Adjacent targets have at least 8px separation where practical.

## Responsive contract

Breakpoints use CSS viewport width, not device detection. These are minimum widths; default styles serve smaller screens.

| Name | Minimum | Layout behavior                                                    |
| ---- | ------- | ------------------------------------------------------------------ |
| Base | 0px     | One-column layout; compact header, stacked forms; horizontal cards |
| sm   | 640px   | More spacing; optional two-column short form fields                |
| md   | 768px   | Wider dialogs; responsive tables may gain optional columns         |
| lg   | 1024px  | Sidebar filters/navigation and up to two feed columns if cards fit |
| xl   | 1280px  | Centered maximum-width layout; avoid stretching reading content    |
| 2xl  | 1536px  | Keep the same content maximum                                      |

At 320px, no page-wide horizontal scrolling or lost actions. Card thumbnail is roughly 88–112px on phones, at most one-third of card width, with a stable 4:3 crop; text column uses min-width: 0 and wraps long words. At larger widths a thumbnail may reach 160px. Reserve image dimensions. Titles may be visually clamped to two lines only if the full title remains available in the accessible link and detail page; do not clamp price or critical restrictions. Optional inclusions wrap rather than shrink below readable size.

Mobile search/filter controls may stick below the header; offer contact actions stick at the bottom only on offer detail pages. Reserve space equal to sticky content height plus safe-area-inset-bottom so it cannot cover text, focused controls or the footer. Desktop filters sit beside the feed; phone filters use a modal bottom sheet. At 200% zoom the layout adapts; at 400% zoom verify reflow at a 320 CSS pixel equivalent. Tables may use their own labelled scroll region when two-dimensional relationships require it.

## Shared component contracts

Implement components with shadcn/ui primitives after T003 initialization, and add product behaviors only in the tasks that own them. The following is a specification, not a claim that components already exist.

| Component                     | Required variants/states                                    | Semantics and behavior                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button / icon button          | Primary, secondary, outline, destructive, loading, disabled | Native button with type; icon buttons have an accessible name; loading uses aria-busy, prevents duplicate submission and preserves label                                |
| Link                          | Inline, navigation, card title                              | Native anchor with meaningful name; current navigation uses aria-current; never nest buttons inside anchors                                                             |
| Form field                    | Input, textarea, select, checkbox; required, help, error    | Persistent label; required text; help/error IDs via aria-describedby; invalid via aria-invalid; native input types/autocomplete                                         |
| Badge                         | Verified, pending, active, paused, ended, error             | Text plus optional decorative icon; verification includes explanation; never imply quality or availability guarantee                                                    |
| Offer card                    | Active, skeleton, unavailable                               | Semantic article with heading link and separate actions; one image; title/property/location/price/unit before inclusions; no whole-card nested interactive controls     |
| Search / category navigation  | Default, populated, loading, empty, error                   | Search landmark and labelled field; exact placeholder from specification; URL-driven category links with aria-current; use ARIA tabs only for actual in-page tab panels |
| Filter controls               | Default, active chips, reset, submitting                    | Named remove buttons; result count announced politely after updates; preserve selected values on errors                                                                 |
| Dialog / sheet                | Open, validating, error                                     | Named modal, trapped focus, inert background, Escape to dismiss, visible close button, return focus to opener; unsaved work warns before discard                        |
| Alert / toast                 | Information, success, warning, error                        | Inline durable errors; polite status for ordinary updates; urgent errors use alert sparingly; no essential instruction only in timed toast                              |
| Empty / loading / error state | Initial loading, no matches, no content, recoverable error  | Explain state and next action; retry keeps user input; skeletons hidden from assistive tech with one loading status                                                     |
| Pagination / Load More        | Ready, loading, exhausted, failed                           | Button retains focus; announce number added; preserve existing cards on failure; filters reset pagination                                                               |
| Table / dashboard navigation  | Loading, populated, empty, error                            | Caption, headers with scope, sort buttons with aria-sort on header; mobile labelled cards or labelled scroll region; active navigation identified                       |

Offer price is mandatory and always includes its pricing unit. Display LKR explicitly and format numbers consistently using en-LK locale. Discount only appears when valid and computed from approved prices. Label publication and redemption/stay dates distinctly. No star-rating or review components, fake checkout or booking counts. Draft public-facing verification copy: “Basic identity and authorization checked by Ayaale. This does not guarantee quality or availability.”

## Accessibility and content standard

Target WCAG 2.2 AA. Normal text contrast is at least 4.5:1; large text and essential UI boundaries at least 3:1. Contrast checks apply to actual foreground/background pairs and every interactive state. Use one main landmark, a skip link, logical headings and one page H1. DOM order follows visual/reading order. All workflows work with a keyboard; no positive tabindex or hover-only information. Screen reader names match visible labels.

Forms have field errors and a linked error summary for multi-field failures; move focus to that summary after failed submission. Never rely on placeholder-only labels. Dialogs follow their primitive's tested focus behavior. Support reduced motion by removing nonessential transitions/animations; never autoplay or flash. Respect forced colors and browser text-spacing overrides. Do not remove native outlines without a visible replacement.

Use meaningful alt text for informative photos; use empty alt for truly decorative or redundant images. Give SVG icons accessible names only when they carry independent meaning. Use polite live regions for asynchronous counts, explicit loading status, and meaningful retry actions. Dates shown to people use clear month names and a stated timezone when timing matters; machine-readable time elements use ISO timestamps. Do not use an ambiguous numeric date alone.

Public-page implementation must preserve server-rendered headings, descriptions and meaningful links. Metadata, canonicals and structured data are implemented in their relevant tasks; this document does not add routes or imply completed SEO setup.

## Verification gates for later implementation

Test representative layouts at 320, 375, 768, 1024 and 1440px; keyboard-only navigation; 200%/400% zoom; reduced motion and forced colors; VoiceOver on Safari and a desktop screen reader/browser combination. Run automated accessibility checks after T005 and manually verify sheets, error focus and sticky controls. Automated contrast/token checks cannot prove browser accessibility or responsive behavior. Record actual results in each delivery task.
