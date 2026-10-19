# Dilmanc interface design

This is the design contract for the existing application, not a proposal for a new visual direction. Use `css/app.css` as the implementation source of truth and keep this file aligned with intentional changes.

For architecture, storage, localization APIs, and verification commands, read `AGENTS.md`.

## Direction

A restrained working interface: a pale blue-gray frame surrounds a white content sheet. The camera, recognized sign, composed sentence, and reply are the primary content. Controls and measurements support those tasks without competing with them.

Keep the existing framed-sheet layout. Do not turn it into a marketing page, decorative dashboard, chat product, or collection of floating cards. Avoid gradients, glass effects, decorative illustrations, oversized branding, and attention-seeking animation.

The hand-shaped mark and the Dilmanc wordmark are the identity. Use the existing inline SVG rather than inventing a new logo or adding a slogan.

## Color tokens

Use CSS custom properties instead of adding unrelated one-off colors.

| Token | Value | Role |
| --- | --- | --- |
| `--ground` | `#f3f7f9` | Application frame |
| `--surface` | `#ffffff` | Sheet, cards, inputs |
| `--raised` | `#eef3f6` | Hover surfaces and chart tracks |
| `--active` | `#e3eaee` | Selected navigation and rows |
| `--border` | `#e3e8eb` | Sheet and card boundaries |
| `--rule` | `#eef1f3` | Table and chart rules |
| `--control` | `#cbd2d6` | Control outlines, not body text |
| `--text` | `#121518` | Main text |
| `--muted` | `#586066` | Secondary text and empty live content |
| `--faint` | `#67707a` | Tertiary values |
| `--accent` | `#00799e` | Focus and identity accent |
| `--primary` | `#15191c` | Primary action background |
| `--primary-ink` | `#ffffff` | Primary action text |
| `--positive` | `#1e7b4f` | Success semantics |
| `--negative` | `#c4242a` | Destructive/recording semantics |
| `--warning` | `#92400e` | Warnings |
| `--chart-1` | `#00799e` | Main chart series and hand skeleton |
| `--chart-2` | `#2f70bb` | Comparison series |
| `--chart-3` | `#a86f0c` | Additional chart semantics |
| `--chart-muted` | `#c9d3d9` | Secondary probability bars |

The accent is a darkened blue associated with the Azerbaijani flag, not a reason to add flag stripes or bright national-color blocks.

Semantic pills use the existing paired background/ink tokens. Do not create a badge for every state. The sheet and ordinary cards have no drop shadows; the transient toast has its existing shadow.

## Typography

- Main family: IBM Plex Sans, with system sans-serif fallbacks.
- Numeric family: IBM Plex Mono, with monospace fallbacks.
- Use `.num` for counters and probability values; preserve tabular numerals.
- Main weights are 400, 500, and 600. Do not add a display font.
- Google Fonts may fail offline; the layout must remain usable with fallbacks.

| Content | Desktop | At widths up to 960 px |
| --- | --- | --- |
| Page title | 22 px / 600 | 22 px / 600 |
| Section title | 16 px / 600 | 16 px / 600 |
| Body | 14 px / 1.5 | 14 px / 1.5 |
| Small text | 12 px | 12 px |
| KPI value | 28 px / 500 | 28 px / 500 |
| Recognized sign | 56 px / 600 | 44 px / 600 |
| Composed sentence | 40 px / 500 | 30 px / 500 |
| Reply | 32 px / 500 | 24 px / 500 |

In projector mode the sentence is 56 px and the reply is 44 px. Preserve their prominence over controls.

## Frame and grid

Desktop shell:

- Sidebar width: 228 px.
- Top bar height: 48 px.
- Content sheet: white, 1 px border, 16 px corner radius, 8 px right/bottom inset.
- View padding: 24 px.
- Content grid: 12 equal columns with 24 px gaps.
- Existing span utilities: 4, 5, 6, 7, 8, and 12 columns.

Sidebar and top bar share the frame background without an extra divider. Navigation is compact, left aligned, and highlights the current page with `--active`.

The top bar contains the mobile Menu control when needed, the current section label, and the 68 px AZ/EN selector. Do not refill empty space with status chips.

At widths up to 960 px:

- Use one content column.
- The sidebar becomes a fixed, translated mobile menu controlled by `.open`.
- Cards span the full grid width.
- View padding becomes 16 px.
- The content sheet loses its outer inset and rounded corners.
- Title rows and card headers may wrap.
- KPI cells use a two-column layout.
- Long tables scroll inside their card body, not across the viewport.

Validate at 390, 768, and 1440 px. English text may be longer than Azerbaijani text; neither language may clip controls or widen the page.

## Components

### Cards and sections

Cards use a 1 px `--border` outline, white background, and 8 px radius. Header padding is `14px 16px 0`; body padding is `12px 16px 16px`.

Use cards to group a real task, not to decorate every label. Related KPI values share a single container separated by hairlines.

### Controls

- Default button/input height: 32 px.
- Large button height: 40 px.
- Control radius: 6 px.
- Default buttons: white with `--control` border.
- Primary buttons: dark `--primary`, not bright accent.
- Destructive actions: red text and explicit confirmation where data is removed.
- Active recording: solid negative color with readable white text.
- Disabled controls: existing reduced opacity and non-interactive behavior.
- Controls wrap in action groups; do not truncate labels to force a row.

Visible focus uses a 2 px accent outline. Inputs retain associated labels. Do not replace meaningful labels with unexplained icons.

### Camera

The camera region uses a 4:3 aspect ratio, dark `#0d1114` background, and 8 px corners. Video and overlay canvas are mirrored together with `scaleX(-1)` and cover the same region.

Hand connections use `--chart-1`, with white landmark points. Body reference lines remain subtle. Do not apply decorative video filters.

Loading, permission, and failure overlays are useful. Permanent "Camera active", model-ready, fallback-voice, and FPS indicators are not. The live webcam is not a prerecorded promotional video and does not need a decorative poster.

During recording, keep the countdown, task-specific recording feedback, and bottom progress bar. Do not remove feedback needed to capture a sample reliably.

### Live content

Recognized sign, sentence, and reply are distinct sections. Keep large, readable output and quiet secondary probabilities. The highest probability bar uses `--chart-1`; the others use `--chart-muted`.

No-recognition and empty-sentence text use `--muted`, not pale border/control colors. The reply starts blank; do not insert an explanatory paragraph in its place.

Preserve actionable warnings when the model needs training or is incompatible with the vocabulary. Removing visual noise does not mean hiding failures.

### Tables and charts

Tables have 44 px body rows and subtle horizontal rules. Numeric columns align right. Hover and selection states must remain distinct.

Charts inherit shared palette and typography. Label training and validation series explicitly and translate their legends. Never fabricate data to fill an empty chart or present a confidence score as measured accuracy.

## Copy and language

Keep the interface functional and brief:

- Prefer labels such as "Sign", "Sentence", "Reply", and "Train".
- Show feedback for a user action, a failure, or a required next step.
- Avoid slogans, repetitive help paragraphs, congratulations, and generic AI explanations.
- Do not restore "Everything stays in this browser; nothing is sent to a server" or similar absolute privacy/offline claims.
- Do not show persistent "Camera active", "Model ready · 8 signs", or "Voice: Turkish (fallback)" indicators.
- Put technical caveats and detailed setup guidance in documentation, not in the working area.
- Do not use the em dash character.

Both AZ and EN are first-class interface languages. Translate labels, actions, logs, confirmations, validation labels, and chart legends. Do not translate user vocabulary, composed Azerbaijani phrases, signer names, or recognized reply transcripts.

## Motion and accessibility

Hover transitions are 120 ms; standard UI transitions are 180 ms. Use the existing easing token. Avoid entrance animations, parallax, glowing accents, or continually moving decorations.

Honor `prefers-reduced-motion`. Preserve visible keyboard focus, readable contrast, semantic buttons, form labels, and non-color cues for important states.

Projector mode hides navigation and the top bar, expands the sheet, and enlarges output. Escape must still leave this mode.

## Review checklist

- Does the change improve a recording, training, recognition, or reply task?
- Does it use the existing tokens and component conventions?
- Is output more prominent than chrome and explanatory copy?
- Do both languages fit at all three test widths?
- Can a keyboard user see focus and reach the controls?
- Are empty, loading, permission, error, recording, and trained-model states still understandable?
- Have removed status indicators and promotional/privacy slogans stayed removed?
- Are model performance and privacy statements accurate rather than decorative reassurance?
