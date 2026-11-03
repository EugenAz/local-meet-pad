# Local Meet Pad

Control Google Meet from a macropad or global keyboard shortcuts—even while another app is in front. Works with Chrome and Chromium browsers. No popup UI: results appear as notifications; clicking the toolbar icon checks mic/camera status.

1. Download or clone this repository.
2. Open your browser’s Extensions page, enable **Developer mode**, and **Load unpacked** → select `extension/`.
3. In extension shortcut settings, assign the keys below and set every action to **Global**. Defaults may remain unassigned if the browser rejects them.
4. Allow browser notifications in macOS settings and reload existing Meet tabs.

| Action | macOS shortcut | Optional macropad control |
| --- | --- | --- |
| Microphone | ⌘⇧7 | Key 1 / F16 |
| Thumbs up | ⌘⇧8 | Key 2 / F17 |
| Raise/lower hand | ⌘⇧9 | Key 3 / F18 |
| Camera | ⌘⇧0 | Knob press / media mute |

**Optional Karabiner setup:** copy [`integrations/karabiner.json`](integrations/karabiner.json) into `~/.config/karabiner/assets/complex_modifications/`, then enable both rules in Complex Modifications. **Left Control + Key 1** toggles Meeting mode. Rules target macropad `1189:8890`; outside this mode, its original signals pass through.

**Confirmation:** requires English Meet controls. Success means the expected change was observed in Meet’s interface. Otherwise it reports **NOT confirmed**, without retrying. It refuses ambiguous calls. Test in an empty call first; UI confirmation does not prove hardware state or delivery to participants.

**Privacy:** Meet-only page access and notification permission. No dependencies, telemetry, recording, persistent data storage, or automatic updates.

Tests (Node.js 22+): `node --test tests/meet-pad.test.cjs`
