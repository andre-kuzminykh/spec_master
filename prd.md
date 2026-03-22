# Product Requirements Document (PRD)

## Product Name
Artifact-Native Agent Workspace

## Document Status
Draft v1

## Product Summary
Artifact-Native Agent Workspace is a Git-native AI workspace where files, versions, tasks, memory, and tools form a single operational layer for building skills, agents, and applications.

The product does **not** start from workflow graphs or node-based automation. Instead, it starts from a workspace with files and folders on the left, a markdown-first editor in the center, and an AI interaction panel that helps the user create, update, and operationalize content. Automation emerges from tasks attached to artifacts and versions.

The user works with:
- files and folders,
- markdown documents,
- AI-assisted generation and patching,
- versioned artifacts,
- task cards,
- tools with permissions,
- memory/context,
- auto or approval-based execution.

Internally, the system may maintain dependencies between tasks and artifacts, but the user does not need to draw graphs or manually connect nodes.

---

# 1. Vision
Create an environment where a user can build agent capabilities, reusable skills, and complete applications by editing documents, attaching context, selecting tools, and defining tasks over versioned artifacts.

The system should feel like:
- a Git/file workspace,
- a markdown IDE,
- an AI copilot,
- a task-based agent runtime,
- a version-aware automation system.

---

# 2. Product Principles
1. **Artifacts are the source of truth**.
2. **The user does not draw workflows**.
3. **Automation is artifact-driven**.
4. **A task uses exactly one tool**.
5. **Tasks are either deterministic or agentic**.
6. **Execution mode is either auto or approval**.
7. **Versioning is first-class**.
8. **AI should act directly on the workspace, not only in chat**.
9. **Tasks, skills, agents, and apps are built from the same primitives**.
10. **The interface must stay simple even if the runtime is complex internally**.

---

# 3. Goals
## 3.1 Business Goals
- Enable users to create useful AI automations without building explicit workflow graphs.
- Turn document work into reusable skills and agent capabilities.
- Allow organizations to operationalize knowledge stored in files and repositories.
- Reduce friction between thinking, editing, automating, and approving changes.

## 3.2 Product Goals
- Let users browse artifacts and work directly in a document-first workspace.
- Let users create task-driven automations from files, prompts, and tools.
- Let users rerun tasks safely when artifacts change.
- Let users manage auto vs approval execution modes.
- Let users assemble tasks into skills, agents, and applications.

## 3.3 User Goals
- Open and edit files easily.
- Use AI directly in the editor.
- Drag context into a task or a document.
- Keep outputs versioned.
- Understand when something is outdated.
- Approve only when needed.
- Reuse tasks as capabilities.

---

# 4. Non-Goals
- A full graph editor as the main interaction model.
- A marketplace of hundreds of visible node types.
- Multi-tool orchestration inside a single visible task card.
- A purely chat-based AI experience detached from the workspace.
- Hiding artifact versions or execution provenance.

---

# 5. Core Domain Model
## 5.1 Workspace
A container for repository connections, files, folders, tasks, agents, skills, runs, and UI state.

## 5.2 Artifact
Any informational object used by the system:
- file,
- folder,
- markdown document,
- generated document,
- prompt file,
- structured record,
- output artifact,
- interface artifact.

## 5.3 Artifact Version
A versioned snapshot or revision of an artifact. Versioning is mandatory for traceability and stale-detection.

## 5.4 Task
A task is a unit of work over artifacts.

A task has:
- title,
- description,
- type: `deterministic` or `agentic`,
- one tool,
- read artifacts,
- write artifacts,
- optional memory/context,
- execution mode: `auto` or `approval`,
- trigger conditions,
- run history,
- version references.

## 5.5 Skill
A reusable task template or grouped capability that can be invoked repeatedly over different artifact versions or contexts.

## 5.6 Agent
A container over tasks and skills with common policies, tools, memory scope, and optional interface/personalization.

## 5.7 Application
A higher-level assembly of agents, skills, artifacts, and interfaces inside one workspace or product area.

## 5.8 Tool Binding
The configuration that links a task to exactly one tool, its parameters, permissions, and runtime policy.

## 5.9 Memory Scope
A selected context scope available to a task or agent, including files, folders, Git paths, pinned artifacts, and optional run history.

## 5.10 Run
An execution instance of a task with:
- timestamp,
- input artifact versions,
- output artifact versions,
- status,
- approval record,
- logs,
- result diff.

---

# 6. Task Model
## 6.1 Task Types
### Deterministic Task
A code-like or fixed-operation task with explicit parameters and predictable execution.

Examples:
- apply structured transformation,
- run a fixed tool call,
- update a file using explicit mapping,
- validate or transform an artifact.

### Agentic Task
A model-assisted task where an LLM interprets context and produces or updates artifacts. It still uses exactly one tool but may use intelligence to fill parameters, reason about context, or generate content.

Examples:
- rewrite section of a PRD,
- summarize documents,
- derive requirements from interviews,
- create or update a file from a prompt and context.

## 6.2 Execution Modes
### Auto
The task runs automatically when trigger conditions are satisfied.

### Approval
The task prepares a proposed result and waits for user approval before being applied or finalized.

## 6.3 One Tool per Task Rule
Each task must bind to exactly one tool. If the user needs multiple operations, the system must split them into multiple tasks.

---

# 7. User Personas
## 7.1 Product Manager
Works with PRDs, research, strategy docs, and planning files. Uses AI to update product docs, create tasks, and keep artifacts aligned.

## 7.2 Technical Founder / Builder
Connects Git repositories, edits files, creates agent skills, and turns tasks into applications.

## 7.3 Analyst / Operator
Uses structured tasks to process files, sync records, and review outputs with approval.

## 7.4 Team Lead / Approver
Reviews generated patches, approves sensitive changes, and monitors stale tasks.

---

# 8. End-to-End Product Flow
1. User connects a Git repository or opens a workspace.
2. User browses files and folders in the left tree.
3. User opens one or more files in tabs.
4. User edits or previews markdown documents.
5. User drags files into the editor as links or references.
6. User invokes the floating AI panel with a simple prompt.
7. AI generates inline output, highlighted in the editor.
8. User chooses to accept, create a new file, or discard.
9. User can expand the AI panel into a fuller task composer.
10. User attaches files, selects memory, chooses one tool, and configures the task.
11. User saves the task as a reusable skill or assigns it to an agent.
12. The system tracks artifact versions.
13. If an input artifact changes, the system marks dependent tasks as stale.
14. The system proposes a rerun or runs automatically depending on task mode.
15. The user can review outputs, approvals, histories, and resulting interface/process views.

---

# 9. Information Architecture
## 9.1 Main Layout
- Left sidebar: file/folder tree and workspace explorer.
- Top bar: tabs, theme toggle, global controls.
- Center: markdown canvas/editor.
- Floating lower panel: narrow AI input widget.
- Expandable bottom area: detailed task composer and context manager.
- Optional side/secondary panels: version history, task details, interface preview, process view.

---

# 10. Features

## Feature 1. Workspace File Tree and Artifact Explorer
### Description
The system provides a left-side explorer that shows files and folders from a connected repository or workspace.

### User Stories
- As a user, I want to see files and folders in a tree so I can navigate my workspace quickly.
- As a user, I want to expand and collapse folders so I can inspect repository structure.
- As a user, I want the system to show which artifacts are used by tasks so I can understand operational context.
- As a user, I want to see whether an artifact changed since a task last ran.

### Use Cases
#### UC1.1 Browse files in a connected repository
Precondition: repository or workspace is connected.
Flow:
1. User opens workspace.
2. System renders the artifact tree.
3. User expands folders.
4. User selects a file.
Outcome: user can discover available artifacts.

#### UC1.2 Inspect artifact state in explorer
Precondition: tasks exist that read or write artifacts.
Flow:
1. User views artifact tree.
2. System decorates artifacts with usage or freshness indicators.
Outcome: user understands which files are operationally important.

### Functional Requirements
- FR1.1 The system shall display files and folders in a collapsible tree.
- FR1.2 The system shall support repository-backed artifact structures.
- FR1.3 The system shall allow selecting files and folders from the tree.
- FR1.4 The system shall display artifact metadata including name, type, and usage state.
- FR1.5 The system shall indicate whether an artifact has changed since the last related task run.
- FR1.6 The system shall allow drag-and-drop of files from the tree into the editor and task composer.
- FR1.7 The system shall support folders as selectable context objects where applicable.

---

## Feature 2. File and Folder Opening in Editor with Tabs
### Description
The system allows users to open files and folders from the artifact explorer into the main workspace and switch across tabs.

### User Stories
- As a user, I want to open multiple files in tabs so I can work across documents quickly.
- As a user, I want to open folder-related file groups so I can view several relevant files in the editor area.
- As a user, I want tabs at the top so I can switch context without losing place.

### Use Cases
#### UC2.1 Open file in editor
1. User clicks a file.
2. System opens it in a new or existing tab.
3. User edits or previews it.
Outcome: file is usable in the editor.

#### UC2.2 Work across multiple open files
1. User opens several files.
2. System shows tabs at the top.
3. User switches between them.
Outcome: user can move between artifacts easily.

### Functional Requirements
- FR2.1 The system shall open a selected file in the central editor area.
- FR2.2 The system shall support multiple open tabs.
- FR2.3 The system shall preserve unsaved state or draft state according to workspace rules.
- FR2.4 The system shall allow switching among tabs without losing editor context.
- FR2.5 The system shall support opening related file sets or multiple files from a folder context.

---

## Feature 3. Markdown-First Editor with Edit and Preview Modes
### Description
The central canvas is a markdown editor supporting both editing and preview/view modes.

### User Stories
- As a user, I want to edit markdown directly.
- As a user, I want to switch to preview mode to inspect final rendering.
- As a user, I want AI-generated insertions to appear directly in the document.

### Use Cases
#### UC3.1 Edit markdown document
1. User opens a markdown file.
2. System enters edit mode.
3. User types and saves changes.
Outcome: document is updated.

#### UC3.2 Preview markdown document
1. User switches to preview.
2. System renders formatted output.
Outcome: user sees the document in readable form.

### Functional Requirements
- FR3.1 The system shall support markdown editing.
- FR3.2 The system shall support preview mode for markdown files.
- FR3.3 The system shall provide a clear mode switch between edit and preview.
- FR3.4 The system shall render AI-generated inserted content distinctly before confirmation.
- FR3.5 The system shall support artifact links inside markdown content.

---

## Feature 4. Drag-and-Drop Artifact Referencing Inside the Editor
### Description
Users can drag files from the artifact tree into the markdown editor, where they become linked references or contextual references.

### User Stories
- As a user, I want to drag files into the editor so I can reference them naturally.
- As a user, I want dragged files to become links or structured references, not raw pasted paths.

### Use Cases
#### UC4.1 Drag file into markdown editor
1. User drags file from tree.
2. User drops it into the editor.
3. System inserts a reference in markdown-friendly form.
Outcome: file is included as document context.

### Functional Requirements
- FR4.1 The system shall allow drag-and-drop of artifacts into the markdown editor.
- FR4.2 The system shall insert a reference/link representation suitable for markdown.
- FR4.3 The system shall preserve artifact identity, not only human-readable text.
- FR4.4 The system shall support dropping files into the expanded task composer as context attachments.

---

## Feature 5. Theme Switching
### Description
Users can switch between dark and light themes from the top-level interface.

### User Stories
- As a user, I want to switch between dark and light mode so I can work comfortably.

### Use Cases
#### UC5.1 Change theme
1. User clicks theme toggle.
2. System switches appearance.
Outcome: UI updates to selected theme.

### Functional Requirements
- FR5.1 The system shall support light theme.
- FR5.2 The system shall support dark theme.
- FR5.3 The system shall allow switching themes from a top-level visible control.
- FR5.4 The system shall preserve theme choice across sessions when applicable.

---

## Feature 6. Floating AI Input Panel for Inline Generation
### Description
A narrow floating panel sits above the lower editor area. It contains a text input and a send button. It is used for fast AI requests directly against the active document/workspace context.

### User Stories
- As a user, I want a minimal AI input bar so I can quickly ask for changes without leaving the editor.
- As a user, I want the AI result to appear in the editor in a highlighted state.
- As a user, I want to accept, create a new file from, or discard AI output.

### Use Cases
#### UC6.1 Generate inline patch from prompt
1. User enters text in AI panel.
2. User clicks Send.
3. System invokes model.
4. System inserts result into editor as highlighted generated content.
5. User chooses accept, create new file, or discard.
Outcome: AI output is operationalized in the workspace.

### Functional Requirements
- FR6.1 The system shall provide a floating AI input widget with a text field and send button.
- FR6.2 The system shall use active editor context by default.
- FR6.3 The system shall render generated result inside the editor in a visibly highlighted state.
- FR6.4 The system shall provide three visible actions for generated result: Accept, Create New File, Discard.
- FR6.5 The system shall not silently persist generated content without user action when the request is interactive.
- FR6.6 The system shall allow generated content to remain inline after acceptance.

---

## Feature 7. Expanded Task Composer
### Description
The AI panel can expand downward into a fuller task configuration area where the user can add more prompt context, descriptions, attached files, memory selections, tool settings, and execution mode.

### User Stories
- As a user, I want to expand the AI panel when I need more control.
- As a user, I want to attach files from the tree into the task.
- As a user, I want to turn an ad hoc request into a reusable task.

### Use Cases
#### UC7.1 Expand simple prompt into configurable task
1. User opens floating AI panel.
2. User expands it.
3. System reveals advanced task fields.
4. User adds a longer prompt, description, files, tool, and execution mode.
Outcome: a reusable task can be saved.

### Functional Requirements
- FR7.1 The system shall support expanding the narrow AI widget into a detailed task composer.
- FR7.2 The system shall allow entering a longer prompt and description.
- FR7.3 The system shall allow dragging or selecting files from the explorer into the composer.
- FR7.4 The system shall allow choosing task type: deterministic or agentic.
- FR7.5 The system shall allow selecting exactly one tool.
- FR7.6 The system shall allow choosing execution mode: auto or approval.
- FR7.7 The system shall allow saving the configured unit as a task.
- FR7.8 The system shall allow converting the configured task into a reusable skill.

---

## Feature 8. Task Cards and Task Management
### Description
Tasks are stored and managed as cards rather than graph nodes.

### User Stories
- As a user, I want tasks to be visible as cards so I can manage work units clearly.
- As a user, I want to know what a task reads, writes, and uses.
- As a user, I want each task to be understandable without seeing a graph.

### Use Cases
#### UC8.1 Review task card
1. User opens task list or task detail.
2. System shows task card metadata.
Outcome: user understands the task.

#### UC8.2 Edit saved task
1. User opens existing task.
2. User updates prompt, tool, memory, or execution mode.
Outcome: task definition is revised.

### Functional Requirements
- FR8.1 The system shall store tasks as distinct entities.
- FR8.2 Each task card shall include title, description, type, tool, reads, writes, mode, and status.
- FR8.3 Each task card shall support editing after creation.
- FR8.4 Each task card shall support displaying latest run metadata.
- FR8.5 The system shall allow organizing tasks under agents and/or skill groups.

---

## Feature 9. Task Type: Deterministic vs Agentic
### Description
Every task must be classified as either deterministic or agentic.

### User Stories
- As a user, I want to choose whether a task is deterministic or agentic.
- As a user, I want deterministic tasks to use explicit logic.
- As a user, I want agentic tasks to use model intelligence over context.

### Use Cases
#### UC9.1 Create deterministic task
1. User creates task.
2. User chooses deterministic.
3. User configures fixed behavior and parameters.
Outcome: task is predictable and explicit.

#### UC9.2 Create agentic task
1. User creates task.
2. User chooses agentic.
3. User configures prompt and context.
Outcome: task uses LLM assistance.

### Functional Requirements
- FR9.1 The system shall require every task to declare type.
- FR9.2 The system shall present deterministic and agentic configuration options differently.
- FR9.3 The system shall support fixed parameter configuration for deterministic tasks.
- FR9.4 The system shall support model-assisted generation for agentic tasks.
- FR9.5 The system shall support AI-assisted parameter filling for agentic tasks where applicable.

---

## Feature 10. One Tool per Task
### Description
Each task must bind to exactly one tool. The user can select the tool from available tools exposed in the workspace.

### User Stories
- As a user, I want a task to use one tool so the unit of work stays clear.
- As a user, I want to understand how a tool is called inside a task.

### Use Cases
#### UC10.1 Select tool for task
1. User creates or edits task.
2. User selects a tool.
3. System enforces one-tool-only rule.
Outcome: task remains atomic and understandable.

### Functional Requirements
- FR10.1 The system shall require exactly one tool selection per task.
- FR10.2 The system shall prevent saving a task with zero tools or multiple tools.
- FR10.3 The system shall show tool identity and binding clearly in the task UI.
- FR10.4 The system shall support deterministic parameter configuration for deterministic tasks.
- FR10.5 The system shall support intelligent parameter fill or contextual invocation support for agentic tasks when applicable.

---

## Feature 11. Memory and Context Selection
### Description
Users can attach memory/context to a task or agent by selecting files, folders, Git paths, and other artifacts.

### User Stories
- As a user, I want to choose which files are available as context.
- As a user, I want to choose memory scope explicitly rather than relying on hidden AI context.

### Use Cases
#### UC11.1 Attach files as task context
1. User creates task.
2. User drags files into task composer.
3. System stores them as context/memory references.
Outcome: task has explicit context.

### Functional Requirements
- FR11.1 The system shall allow users to attach files to a task as context.
- FR11.2 The system shall allow users to attach folders or Git paths where supported.
- FR11.3 The system shall distinguish direct reads/writes from auxiliary memory/context.
- FR11.4 The system shall allow memory configuration at task level.
- FR11.5 The system shall allow shared memory configuration at agent level.

---

## Feature 12. Artifact Versioning and History
### Description
Artifacts must be versioned so the system can determine whether a task is stale, reproducible, or based on outdated context.

### User Stories
- As a user, I want every important file change to be version-aware.
- As a user, I want to know which task created or updated a file.
- As a user, I want to know whether my task was run on older context.

### Use Cases
#### UC12.1 View artifact history
1. User opens artifact details.
2. System shows versions and related runs.
Outcome: user understands artifact lineage.

#### UC12.2 Detect outdated task due to changed artifact
1. Input artifact changes.
2. System compares current versions with last-run versions.
Outcome: related tasks are marked stale.

### Functional Requirements
- FR12.1 The system shall maintain version references for artifacts used in tasks.
- FR12.2 The system shall store the artifact versions used in each run.
- FR12.3 The system shall show which task last created or modified an artifact when known.
- FR12.4 The system shall detect when a task depends on changed input artifacts.
- FR12.5 The system shall expose artifact history and task-run lineage in the UI.

---

## Feature 13. Stale Detection and Rerun Suggestions
### Description
When an artifact changes after a task has run, the system should determine whether the task is stale and suggest or trigger rerun accordingly.

### User Stories
- As a user, I want to be notified when a task might need rerunning because context changed.
- As a user, I want the system to ask whether it should rerun a task using updated context.

### Use Cases
#### UC13.1 Suggest rerun after input change
1. Artifact version changes.
2. System finds tasks that used older version.
3. System prompts the user that the task may need rerun.
Outcome: user can refresh automation.

### Functional Requirements
- FR13.1 The system shall compare current artifact versions against task last-run input versions.
- FR13.2 The system shall mark affected tasks as stale.
- FR13.3 The system shall notify the user when a stale task may need rerun.
- FR13.4 The notification shall explain which artifact changed.
- FR13.5 The system shall allow the user to rerun the task with updated context.
- FR13.6 The system shall support automatic rerun for tasks in auto mode where policy allows.

---

## Feature 14. Execution Modes: Auto and Approval
### Description
Tasks may either execute automatically or wait for user approval before finalization.

### User Stories
- As a user, I want some tasks to run automatically.
- As a user, I want sensitive tasks to require my approval.

### Use Cases
#### UC14.1 Auto-run eligible task
1. Trigger condition is met.
2. Task is in auto mode.
3. System runs task.
Outcome: output is produced without manual intervention.

#### UC14.2 Approve generated result
1. Trigger condition is met.
2. Task is in approval mode.
3. System prepares result.
4. User reviews and approves.
Outcome: output is applied only after approval.

### Functional Requirements
- FR14.1 The system shall support auto execution mode.
- FR14.2 The system shall support approval execution mode.
- FR14.3 The system shall allow choosing execution mode at task creation or edit time.
- FR14.4 The system shall present generated results for review before approval when approval mode is enabled.
- FR14.5 The system shall record approval decisions in task run history.

---

## Feature 15. Generated Content Actions: Accept, Create New File, Discard
### Description
AI-generated content inside the editor can be applied inline, turned into a new file, or discarded.

### User Stories
- As a user, I want inline content to be explicitly controllable.
- As a user, I want to create a new file from generated output without manually copying it.

### Use Cases
#### UC15.1 Accept generated inline content
1. AI produces highlighted content.
2. User accepts it.
Outcome: content becomes part of the current file.

#### UC15.2 Create new file from generated content
1. AI produces content.
2. User selects Create New File.
Outcome: new artifact is created from output.

#### UC15.3 Discard generated content
1. AI produces content.
2. User selects Discard.
Outcome: generated content is removed.

### Functional Requirements
- FR15.1 The system shall support accepting generated content inline.
- FR15.2 The system shall support creating a new file from generated content.
- FR15.3 The system shall support discarding generated content.
- FR15.4 The system shall preserve auditability of these actions in run history where appropriate.

---

## Feature 16. Skills
### Description
Users can save tasks or task patterns as reusable skills.

### User Stories
- As a user, I want to turn a useful task into a reusable skill.
- As a user, I want to apply a skill repeatedly over changing artifacts.

### Use Cases
#### UC16.1 Save task as skill
1. User configures task.
2. User chooses save as skill.
Outcome: task becomes reusable capability.

### Functional Requirements
- FR16.1 The system shall support saving a task as a reusable skill.
- FR16.2 A skill shall preserve task type, tool, memory scope, and execution mode.
- FR16.3 The system shall allow reusing a skill in multiple contexts or agents.

---

## Feature 17. Agents
### Description
Agents are containers over tasks and skills, with shared memory policies, tools, and optional interface/personalization.

### User Stories
- As a user, I want to group tasks into an agent.
- As a user, I want agents to have their own capabilities and context.

### Use Cases
#### UC17.1 Create agent from tasks
1. User creates or selects agent.
2. User adds tasks/skills to agent.
Outcome: agent becomes an operational bundle of capabilities.

### Functional Requirements
- FR17.1 The system shall support creating agents.
- FR17.2 The system shall allow assigning tasks and skills to an agent.
- FR17.3 The system shall allow configuring shared memory/context at agent level.
- FR17.4 The system shall allow configuring tool availability and permissions at agent level.
- FR17.5 The system shall support optional interface/personalization metadata for each agent.

---

## Feature 18. Applications
### Description
Users can group agents, skills, and artifacts into larger applications.

### User Stories
- As a user, I want to combine multiple agent capabilities into an application.
- As a user, I want applications to be built from reusable parts.

### Use Cases
#### UC18.1 Assemble application from agents and skills
1. User defines application area.
2. User attaches agents and related artifacts.
Outcome: reusable app layer is created.

### Functional Requirements
- FR18.1 The system shall support application-level grouping of agents, skills, and artifacts.
- FR18.2 The system shall allow an application to expose related interfaces or process views.
- FR18.3 The system shall preserve lineage from application to agent to task to artifact.

---

## Feature 19. Process Views and Interfaces
### Description
The system supports viewing task/agent behavior as processes and embedding or exposing interfaces associated with agents or applications.

### User Stories
- As a user, I want to inspect a process-oriented view of task execution.
- As a user, I want to attach or expose an interface tied to an agent or workflow-like capability.

### Use Cases
#### UC19.1 View process representation
1. User opens process view.
2. System displays task/process-oriented representation based on artifact-task relationships.
Outcome: user understands runtime and operational flow without editing graphs.

#### UC19.2 Open agent interface
1. User selects agent or application interface.
2. System renders the associated interface.
Outcome: user can interact with the agent/app through a dedicated UI.

### Functional Requirements
- FR19.1 The system shall support process-oriented views derived from task and artifact relationships.
- FR19.2 The system shall support interface artifacts or interface attachments associated with agents/applications.
- FR19.3 The system shall allow opening and interacting with such interfaces in the workspace.

---

## Feature 20. Internal Dependency Tracking (Invisible to Primary UX)
### Description
Although users do not draw graphs, the system must internally track dependencies among artifacts and tasks.

### User Stories
- As a user, I do not want to manually draw connections.
- As a system operator, I need internal dependency tracking for reruns, freshness, and observability.

### Use Cases
#### UC20.1 Infer dependency through reads/writes
1. Task reads artifact A and writes artifact B.
2. System records internal dependency.
Outcome: stale detection and ordering become possible.

### Functional Requirements
- FR20.1 The system shall internally record task read/write dependencies.
- FR20.2 The system shall use internal dependency tracking for freshness detection, rerun recommendations, and lineage.
- FR20.3 The system shall not require users to manually connect tasks in a graph editor.

---

## Feature 21. Run History, Status, and Observability
### Description
Users need visibility into task execution state and outcomes.

### User Stories
- As a user, I want to know when a task ran last.
- As a user, I want to know whether it succeeded, failed, or is waiting.
- As a user, I want to inspect outputs and diffs.

### Use Cases
#### UC21.1 Review task history
1. User opens task details.
2. System shows run timeline and statuses.
Outcome: user understands operational state.

### Functional Requirements
- FR21.1 The system shall record task run history.
- FR21.2 The system shall expose status such as fresh, stale, waiting approval, running, failed, and up to date.
- FR21.3 The system shall show last run time.
- FR21.4 The system shall show input/output versions for a run.
- FR21.5 The system shall show result diffs where applicable.

---

# 11. Functional Cross-Cutting Requirements
## 11.1 Version Awareness
- The system must be version-aware across artifacts, tasks, and runs.
- Every rerun decision must be explainable by changed inputs.

## 11.2 Traceability
- The system must track which task created or updated an artifact when possible.
- The system must track which artifact versions were used by each run.

## 11.3 Simplicity of UX
- Primary UX must remain artifact-centric and task-centric.
- Graph editing must not be required for the primary experience.

## 11.4 Safety and Review
- Approval mode must be available for sensitive or user-controlled outputs.
- Generated changes should be inspectable before finalization.

## 11.5 Reusability
- Tasks should be promotable to skills.
- Skills should be assignable to agents.
- Agents and skills should be composable into applications.

---

# 12. Non-Functional Requirements
## 12.1 Usability
- Core actions must be possible from the main workspace without leaving the file/editor context.
- The floating AI input should be fast and low-friction.

## 12.2 Performance
- Opening files and switching tabs should feel immediate.
- Inline AI requests should provide visible progress states.
- Version and stale checks should be efficient for common workspace sizes.

## 12.3 Reliability
- Task definitions and artifact versions must not be lost across sessions.
- Approval state and run history must be durable.

## 12.4 Extensibility
- The data model should support additional tool types and interface types without changing the core task abstraction.

---

# 13. Success Metrics
## 13.1 Adoption Metrics
- Number of workspaces created.
- Number of tasks created.
- Number of skills saved.
- Number of agents created.

## 13.2 Activation Metrics
- Time from workspace open to first task creation.
- Time from prompt to accepted inline output.
- Percentage of users who create at least one reusable skill.

## 13.3 Operational Metrics
- Percentage of stale tasks successfully rerun.
- Ratio of approval vs auto tasks.
- Number of output artifacts created from AI actions.

## 13.4 Experience Metrics
- Acceptance rate of AI-generated inline suggestions.
- Rate of generated content turned into new files.
- Frequency of context attachment from file tree.

---

# 14. Open Product Questions
1. Should folders dropped into context be expanded dynamically or snapshotted at selection time?
2. What artifact types besides files and folders should be first-class in v1?
3. Should task cards live in a dedicated panel, a document section, or both?
4. How should agent interfaces be authored and stored?
5. What permission model is required for tool bindings in v1?
6. Should approval support partial acceptance of AI-generated patches?
7. How should conflict resolution work if a target file changed between generation and approval?

---

# 15. MVP Recommendation
## Included in MVP
- File tree
- File/folder navigation
- Multi-tab editor
- Markdown edit/preview
- Drag-and-drop artifact references
- Theme toggle
- Floating AI panel
- Inline generated content with accept/new file/discard
- Expanded task composer
- Deterministic vs agentic task type
- One tool per task
- Memory/context selection
- Artifact versioning basics
- Task storage and run history basics
- Stale detection and rerun suggestions
- Auto vs approval modes
- Save task as skill
- Basic agent grouping

## Deferred Beyond MVP
- Advanced application packaging
- Rich interface builder for agents/apps
- Deep process analytics views
- Sophisticated permission hierarchies
- Complex branching/graph visualization as a user-facing primitive

---

# 16. Product Statement
Artifact-Native Agent Workspace lets users build AI-powered skills, agents, and applications by working directly with versioned artifacts in a markdown-first environment. Users do not need to design workflow graphs. They browse files, edit documents, invoke AI, attach context, select one tool per task, and define whether execution is automatic or approval-based. The system tracks versions, detects stale tasks, and turns document work into reusable operational capabilities.

