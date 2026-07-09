# Agent instructions for Cinder

Cinder is an open-source local-first agent work host. It is installed and maintained by AI agents as often as by humans.

## Product intent

Cinder is not a terminal multiplexer, IDE, or project management system. It is a review inbox for finished AI work.

Core positioning:

> Turn high-volume agent output into a low-cognitive-load human review flow.

## MVP behavior

- Mac runs `cinder host`.
- The UI is served locally as a browser/PWA app.
- One card on the main screen.
- Show the user's latest request.
- Show the agent's full final answer.
- Hide process logs by default, but keep them expandable.
- Main actions: Continue, Later, Done.
- Later moves the card to the back of the review pile.
- Done closes the task and keeps it searchable/resumable.
- Running tasks do not appear in the review card pile.

## Engineering rules

- Prefer small, direct changes.
- Avoid new dependencies unless they remove real complexity.
- Keep installation agent-friendly: `./install.sh`, `cinder doctor`, `cinder open`.
- Do not require cloud services, accounts, or centralized infrastructure for the core app.
- Keep user data local by default.
- Do not add analytics or telemetry without an explicit user-facing setting.
- Keep the host/client boundary clean. The host owns tasks and CLI execution; clients only send commands and render state.

## CLI integration

First-party integrations:

- Claude Code
- Codex CLI

When adding providers, keep a provider adapter boundary. Do not leak provider-specific command flags into the renderer UI unless the user needs to choose them.
