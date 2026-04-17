Run interactive project setup. Follow these steps strictly.

## Step 1 — Silent Scan
Scan all repos/folders in this project directory. Detect:
- Tech stack per repo (framework, language, libraries, versions)
- Folder structure & architecture
- Naming conventions (files, folders, variables, components)
- Code patterns used

## Step 2 — Interactive Q&A
Ask ONE question at a time. Wait for user response before proceeding.

Ask in this order:
1. "Nama project ini apa?"
2. "Tech stack yang saya detect: [hasil scan]. Benar? Ada yang perlu ditambah/ubah?"
3. "Folder structure: [hasil scan]. Benar? Ada koreksi?"
4. "Naming convention yang saya detect: [hasil scan]. Benar?"
5. "Jira base URL? (contoh: company.atlassian.net)"
6. "Jira API key?"
7. "Jira project key? (contoh: PROJ)"
8. "Figma API key?"
9. "Base URL API backend?"
10. "Ada hal lain yang perlu saya ketahui tentang project ini?"

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
  "jira_base_url": "",
  "jira_api_key": "",
  "jira_project_key": "",
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
Show full summary of saved config. Ask: "Setup selesai. Ada yang perlu diubah?"
