Generate opinionated, production-grade frontend design guidance. Avoid generic AI aesthetics.

## Step 0 — Load Context
Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory active)" then load relevant design memory:
  `curl -s "http://localhost:37777/memory/search?q=design+frontend+UI&project={project_name}&limit=5"`
- If offline: show "(worker OFFLINE ⚠️ — memory unavailable)" and continue without memory

**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip all (y/n) confirmation gates, skip Step 4 memory save
- If `structured` (or file absent): proceed normally

## Step 1 — Understand the UI
Ask: "Describe what you're building — page type, context, target audience, and any mood or brand direction."

Accept any form: vague description ("a dashboard for SaaS app"), specific component ("dark-mode settings panel"), or screenshot path.

Follow up with at most 1 targeted question if the answer would change the design direction:
- "What's the primary action this UI should drive?"

If screenshot path provided: read and analyze the image visually before proceeding.

## Step 2 — Generate Design System
Silently derive the system against these principles:

**Typography**
- Choose one headline face (geometric sans or editorial serif) + one body face
- Never default to system-ui or Inter as the headline — pick something with personality
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 48px

**Color**
- Derive palette from brand/context cues, not from convenience
- Avoid using #2563EB / #7C3AED / #10B981 as primary unless contextually justified
- Use an unexpected accent color with restraint (one pop color, one neutral family)
- Dark mode: surface is never pure black — use #0F0F0F or #111318

**Spacing**
- Base unit: 4px
- Padding rhythm: 8 / 12 / 16 / 24 / 32 / 48 / 64px
- High information density > airy white space unless editorial context

**Motion**
- Prefer enter animations over exit
- Duration: 150ms–300ms
- Easing: cubic-bezier(0.16, 1, 0.30, 1) for reveals; ease-out for micro-interactions
- No bounce unless the context is explicitly playful

**Components**
- Micro-details (subtle borders, inner shadows, hover state transitions) > flat shapes
- Avoid card grids with identical height — let content breathe unevenly
- Buttons: never fully rounded pill shape unless brand calls for it

## Step 3 — Output Design System
Present the complete design system in this exact structure:

```
## Design System: {UI name}

### Typography
- Headline: {font-family} — {weight}, used for {h1/h2/hero}
- Body: {font-family} — {weight}, {base size}px
- Mono: {font-family}

### Color Palette
- Background:    {hex} — {label}
- Surface:       {hex} — {label}
- Surface raised:{hex} — {label}
- Primary:       {hex} — {label}
- Accent:        {hex} — {label}
- Text primary:  {hex}
- Text secondary:{hex}
- Border:        {hex}

### Spacing & Layout
- Base unit: 4px
- Content max-width: {value}
- Grid: {N} col, {gutter}px gutter

### Motion
- Default transition: {duration}ms {easing}
- Enter animation: {description}
- Hover micro-interaction: {description}

### Component Patterns
- {Component}: {specific guidance — be concrete, not generic}
- {Component}: {specific guidance}

### Anti-patterns for this UI
- Avoid: {specific thing} — {reason}
- Avoid: {specific thing} — {reason}

### CSS Custom Properties (ready to paste)
```css
:root {
  --bg: {hex};
  --surface: {hex};
  --primary: {hex};
  --accent: {hex};
  --text: {hex};
  --text-muted: {hex};
  --border: {hex};
  --font-headline: '{font}', sans-serif;
  --font-body: '{font}', sans-serif;
  --radius: {value};
  --transition: {duration}ms {easing};
}
```
```

Ask: "Design system ini sesuai? (y/n atau describe apa yang perlu diubah):"
- If y: proceed to Step 4
- If n: adjust based on feedback and re-present

## Step 4 — Save to Memory (if worker running)
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "design_decision",
    "content": "Design system for {UI name}: headline={font}, primary={color}, accent={color}, key pattern={pattern}.",
    "metadata": {"source": "ec-design"}
  }'
```

Show: "Design system saved to memory. Reference these tokens in /ec-feature + /ec-execute when coding UI components."
