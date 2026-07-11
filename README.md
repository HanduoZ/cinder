# Cinder

Swipe through finished AI agent work.

Cinder is a local-first agent work host for vibe coders who run many AI coding tasks in parallel. It turns finished Claude Code and Codex CLI runs into a single-card review flow:

- Read the last request.
- Read the agent's full final answer.
- Type a follow-up and press Enter, or send the card Later, or mark it Done.

The product goal is not session management. The goal is to turn high-volume AI output into a low-cognitive-load human review flow.

## For AI agents installing Cinder

If a user gives you this repository and asks you to install Cinder:

1. Run `./install.sh`.
2. Run `cinder doctor`.
3. If doctor passes, run `cinder`.
4. If Claude Code or Codex are missing, tell the user which one is missing.
5. Do not edit shell startup files unless the user asks.

## Install

```sh
git clone https://github.com/HanduoZ/cinder.git
cd cinder
./install.sh
cinder doctor
cinder
```

To use Cinder from an iPhone or iPad on the same Wi-Fi:

```sh
cinder host --lan
```

Open the printed Phone/iPad URL on the device.

## Native iOS app

Cinder also includes a native SwiftUI iOS app for iPhone and iPad. It connects to the Cinder host on your Mac, then gives you the mobile-first card flow:

- swipe left/right to move through active cards
- swipe up to suspend a card
- type and send to continue the current card
- approve completed cards
- review running cards as live process output

```sh
cinder host --lan
cinder ios
```

The iOS target supports iOS 15.0 and newer, including iPhone 7 Plus on iOS 15.8.8. To install on a physical iPhone, open the project from `cinder ios`, pick your connected iPhone in Xcode, select a signing team, and Run.

## Current app

- Local Mac host with browser/PWA UI.
- Native iOS SwiftUI client.
- Supports Claude Code and Codex CLI.
- Starts new local CLI tasks.
- Captures stdout and stderr.
- Shows one finished card at a time.
- Supports Continue, Later, Done.
- Stores local task history in `~/.cinder/tasks.json`.
- Supports searching completed tasks and resuming from a completed task.
- Does not require an account or Cinder server.

## CLI

```sh
cinder open
cinder host --lan
cinder doctor
cinder logs
cinder install-ponytail
```

## Ponytail

Cinder works well with Ponytail, a lazy senior dev mode for AI coding agents.

```sh
cinder install-ponytail
```

Codex may still require hook trust. Open Codex, run `/hooks`, review the Ponytail lifecycle hooks, and trust them.

## Development

```sh
npm install
npm start
```

## License

MIT
