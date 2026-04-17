Explore solution approaches before committing to a feature plan. Read .claude/project-config.json and CLAUDE.md first.

## Step 0 — Load Context
Read `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`.

Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory active)" then load relevant memory:
  `curl -s "http://localhost:37777/memory/search?q={problem_keywords}&project={project_name}&limit=5"`
- If offline: show "(worker OFFLINE ⚠️ — memory unavailable)" and continue without memory

**Onboarding check:** Verify `.claude/context/stack.md`, `.claude/context/structure.md`, and `.claude/context/conventions.md` all exist and are non-empty.
- If all present: proceed normally
- If any are missing or empty: show "(context incomplete — run /ec-setup first to configure this project)" and stop

Use memory to surface: past decisions, similar problems solved before, patterns already in use. Do not dump raw memory — silently inform your suggestions.

## Step 1 — Understand the Problem
Ask: "What problem are you trying to solve? (describe freely — no need to have a solution yet)"

Accept any form: vague idea, user complaint, business requirement, technical pain point.

Follow up only if needed:
- "Who experiences this problem?"
- "What does success look like?"
- "Any constraints I should know? (time, tech, compatibility)"

## Step 2 — Silent Analysis
Before generating options, silently analyze:
- Existing code patterns relevant to this problem (from context + memory)
- Potential breaking changes or risks
- Over-engineering traps to avoid
- Quick wins vs. proper solutions

## Step 3 — Present Options
Generate **2–3 distinct approaches**. Each option must be meaningfully different — not variations of the same idea.

Format:
```
## Option {n}: {short name}

**Approach:** {1-2 sentence description}

**Pros:**
- {concrete advantage}
- {concrete advantage}

**Cons:**
- {concrete risk or downside}
- {concrete risk or downside}

**Best when:** {specific scenario where this shines}
**Effort:** S / M / L
**Risk:** Low / Medium / High
```

After presenting all options:
"Which option do you want to go with? (or mix elements from multiple?)"

## Step 4 — Deepen the Chosen Option
Once user picks an option:
- Ask any remaining open questions specific to that approach
- Identify the 2–3 biggest unknowns or assumptions
- Flag any dependencies on other parts of the system

## Step 5 — Save Decision
Save to `.claude/decision.md`. Replace `{YYYY-MM-DD}` with today's date (use `currentDate` context variable if available, otherwise `date +%Y-%m-%d`):

```markdown
# Decision: {problem_title}

## Problem
{problem statement in one paragraph}

## Options Explored
- **Option 1 — {name}**: {one-line summary} → not chosen because: {reason}
- **Option 2 — {name}**: {one-line summary} → not chosen because: {reason}
- **Option 3 — {name}**: {one-line summary} → CHOSEN

## Chosen Approach
{2-3 paragraph description of the chosen approach}

## Key Assumptions
- {assumption 1}
- {assumption 2}

## Risks & Mitigations
- {risk} → {mitigation}

## Out of Scope
- {what was explicitly not addressed}

_Created: {YYYY-MM-DD}_
```

If worker running, save decision to memory:
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "decision",
    "content": "Brainstorm: {problem_title}. Chose: {chosen_option}. Because: {reason}.",
    "metadata": {"source": "brainstorm"}
  }'
```

## Step 6 — Hand Off
Show summary of the decision, then ask:
"Ready to plan the implementation? Run /ec-feature — it will load this decision automatically."
