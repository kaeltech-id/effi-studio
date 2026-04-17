Run interactive project setup. Follow these steps strictly.

## Step 1 — Silent Scan
Scan all repos/folders in this project directory. Detect:
- Tech stack per repo (framework, language, libraries, versions)
- Folder structure & architecture
- Naming conventions (files, folders, variables, components)
- Code patterns used

## Step 2 — Interactive Q&A
Ask ONE question at a time. Wait for user response before proceeding.

1. "What is this project called?"
2. "Tech stack I detected: [scan result]. Correct? Anything to add or change?"
3. "Folder structure: [scan result]. Correct? Any corrections?"
4. "Naming conventions I detected: [scan result]. Correct?"
5. "Do you use a project management tool? (Jira / Linear / GitHub Issues / Notion / Trello / other / none)"
   - If yes: "Base URL?" then "API key?" then "Project key or board ID?"
   - If none: skip
6. "Do you use Figma or another design tool? (Figma / Sketch / other / none)"
   - If Figma: "Figma API key?"
   - If other: "How do you share designs? (link / screenshot / description)"
   - If none: skip
7. "Backend API base URL? (or skip)"
8. "Anything else I should know about this project?"

## Step 3 — Save Files
After all answers collected, create/overwrite these files:

### CLAUDE.md
```
# {project_name}
Stack: {stack_summary}
Config: .claude/project-config.json
Context: .claude/context/

## GIT RULES
- NEVER perform any git operation autonomously
- NEVER commit, push, pull, merge, branch, stash without /git command
- Git ONLY allowed when user explicitly runs /git
```

### .claude/project-config.json
```json
{
  "project_name": "",
  "ticket_tool": "",
  "ticket_base_url": "",
  "ticket_api_key": "",
  "ticket_project_key": "",
  "design_tool": "",
  "figma_api_key": "",
  "api_base_url": ""
}
```

### .claude/context/stack.md
Tech stack detail per repo.

### .claude/context/structure.md
Folder structure & architecture detail.

### .claude/context/conventions.md
Naming conventions & clean code rules.

### .gitignore
Add `.claude/project-config.json` to gitignore.

## Step 4 — Confirm
Show full summary of saved config. Ask: "Setup complete. Anything you'd like to change?"
