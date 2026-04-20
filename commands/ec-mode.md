Read or set the current EffiClaude coding mode.

## Step 1 — Read current mode
Run: `cat .claude/.mode 2>/dev/null || echo "structured"`
Store result as MODE.

## Step 2 — Handle args

**If no args provided (just `/ec-mode`):**
Show current mode and stop:
- If MODE=vibe: "⚡ VIBE MODE — /ec-mode structured to switch back"
- If MODE=structured: "⚙️ STRUCTURED MODE — /ec-mode vibe to switch"

**If arg provided:**
- Accept `vibe` or `structured` only. Anything else: show "Usage: /ec-mode vibe | structured" and stop.
- If arg == MODE (no change): show "Already in {arg} mode — no change." and stop.
- Write mode: `echo "{arg}" > .claude/.mode`
- Show confirmation:
  - If switched to vibe: "⚡ VIBE MODE activated — confirmation gates, next-step suggestions, and memory saves disabled"
  - If switched to structured: "⚙️ STRUCTURED MODE activated — full workflow enabled"
