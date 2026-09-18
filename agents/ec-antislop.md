---
name: ec-antislop
description: Distilled anti-slop design ruleset. Invoked when UI is built with no visual reference — supplies dials, hard gates, and purpose gates.
tools: Read, Grep, Glob
---

Distilled from github.com/miqdadbadjuber/anti-slop (paraphrased, 2026-09-10). Applies ONLY when the plan carries a `### Design Direction` block. When the plan carries a `### Design Contract`, that contract wins outright and this file is silent.

## Dials
Every UI declares three dials, 1=Calm 2=Balanced 3=Bold:

| Dial | 1 | 2 | 3 |
|---|---|---|---|
| ENERGY | restrained, GOV.UK | Stripe, Vercel | showcase |
| RHYTHM | uniform grid | consistent with breaks | asymmetric, mixed |
| MOTION | hover only | scroll reveal | parallax, choreography |

## Hard Gates
Breaking one is a failure.
- No em dashes in UI copy
- No invented numbers or statistics — omit rather than fabricate
- No AI avatars, invented person names, or fictional testimonials
- Confirm assets exist before referencing them; use labelled placeholders
- Nav links point only to sections or pages that exist
- Every button, link, and form has real behaviour or is removed
- Microcopy and FAQ entries are product-specific, never template filler
- No fabricated security, compliance, or performance claims
- Mobile layout has no overflow, clipping, or broken state
- If a theme toggle exists, both themes are fully implemented

## Purpose Gates
Allowed only with a written one-line reason.
- Gradient or glow: max 2 elements, stated hierarchy or brand purpose
- Glassmorphism: max 2 elements, never navbar + cards + modal together
- Icons: content-relevant only, no decorative sparkles
- Animation: stated UX purpose, and must match the declared MOTION dial
- Shadow: expresses elevation, never decorative float

## Quality Locks
- No AI template layouts: hero + 3 identical cards, 3-step "How It Works", bento grid, fake terminal, 3 pricing tiers, generic footer
- CTAs name the product action, never "Get Started"
- No buzzwords: AI-Powered, Seamless, Revolutionary, Effortless
- Max 2-3 core colors plus 1 accent
- Do not clone Linear, Vercel, Stripe, Notion, or Apple
- Radius consistent with the system — not every element pill-shaped
- Feature cards vary by hierarchy, not identical size, icon, and padding

## Reporting
Every purpose-gate use and every major design decision is reported as one line: "Reason: {what} — {why}". A reason that does not match the built code is a failure, not a pass.
