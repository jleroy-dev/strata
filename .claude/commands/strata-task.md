---
description: Deep business logic understanding for task handoff - like onboarding a senior developer
---

You are being handed off a task on the Strata project. Your role is to deeply understand the business logic and code flow of the specified components so you can respond to any implementation request.

**TASK HANDOFF TARGETS:**
$ARGUMENTS

**UNDERSTANDING METHODOLOGY:**

1. **Business Context First** - Understand what this feature does for users and the business
2. **User Journey Mapping** - Follow the complete user workflow and interactions
3. **Data Flow Analysis** - Track data from input → processing → storage → display
4. **Integration Points** - Map APIs, services, external systems, and dependencies
5. **Business Rules Discovery** - Identify validation logic, calculations, and domain rules
6. **State Management Understanding** - How data flows through the application

**STRATA DOMAIN:**

- An abstract, live 3D view of one codebase, read in a glance from a side panel
- Terrain from the repo (files, folders, workspace projects, imports as roads)
- Weather from coding agents (Claude Code hooks: reading lights a block, editing pulses it)
- Layout is deterministic and stable; motion is the product; nothing looks like a place
- See docs/DESIGN.md and docs/ENGINEERING_NOTES.md

**FOCUS ON BUSINESS LOGIC:**

- **What does this feature accomplish?** - User value and business purpose
- **How do users interact with it?** - UI flows, input validation, feedback
- **What data transformations occur?** - Calculations, aggregations, formatting
- **What business rules apply?** - Validation criteria, access controls, workflows
- **How does it integrate?** - APIs consumed/provided, external dependencies
- **What are the key scenarios?** - Normal flow, edge cases, error handling

**TECHNICAL UNDERSTANDING (Supporting Business Logic):**

- Component architecture and lifecycle
- Service dependencies and facade patterns
- API endpoints and data models
- State management and reactive patterns
- Translation keys and user-facing messages
- Routing and navigation flows

**TRUST EXISTING IMPLEMENTATIONS:**

- Assume current code works correctly for its intended purpose
- Focus on understanding behavior, not evaluating quality
- Use existing patterns as examples of how things should work
- Don't look for technical debt unless it blocks understanding

**ANALYSIS DEPTH:**

- Read all specified targets thoroughly
- Follow dependency chains that affect business logic
- Examine related models, services, and API integrations
- Review translations to understand user-facing functionality
- Check routing and navigation to understand feature boundaries

**OUTPUT FOCUS:**
Provide comprehensive business logic understanding covering:

- **Feature Purpose** - What this accomplishes for users/business
- **User Workflows** - How users interact with the feature
- **Data Processing** - Key transformations and business rules
- **Integration Points** - External systems and API dependencies
- **Key Business Scenarios** - Normal operations and edge cases

**READINESS GOAL:**
After analysis, you should be able to handle any request about this feature:

- Implement new functionality or enhancements
- Debug issues or fix bugs
- Explain behavior to stakeholders
- Modify business logic or workflows
- Integrate with new systems or APIs

**NO IMPLEMENTATION** until specifically requested. Focus purely on deep understanding of the business domain and feature functionality.
