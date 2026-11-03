# Set up the whole keypad on another Mac

You will set up two things on the new Mac: **Karabiner-Elements** and the **Local
Meet Pad browser extension**. If you are moving the same keypad, its programming
is already saved inside it. **You do not need to program it again.**

The chain is:

**Keypad → Karabiner Meeting mode → global browser shortcut → Meet control → result notification.**

The extension finds your call without switching windows. You can keep reading,
coding, or working in another app. Keep the browser running with your call open.

## 1. Get the files

Download this repository with **Code → Download ZIP**, unzip it, and move the
folder somewhere permanent. Keep it there: the browser loads the extension from
that folder each time it starts.

Alternatively, with Git installed:

```sh
git clone https://github.com/EugenAz/local-meet-pad.git
cd local-meet-pad
```

No Node.js, Rust, package installation, or build step is needed for normal use.

## 2. Plug in the keypad

Use a USB cable that transfers data. Our setup uses keypad ID **1189:8890** and
these signals:

| Physical control | Signal saved on the keypad |
| --- | --- |
| Key 1 | F16 |
| Key 2 | F17 |
| Key 3 | F18 |
| Knob left/right | Volume down/up |
| Knob press | System sound mute |

If this is the same keypad you already configured, skip straight to step 3.
For a different keypad, see [Programming a replacement keypad](#programming-a-replacement-keypad).

## 3. Install Karabiner and enable the devices

1. Install [Karabiner-Elements](https://karabiner-elements.pqrs.org/).
2. Open it and finish its setup assistant. Enable the services, driver, and macOS
   permissions it requests, including Input Monitoring and Accessibility where
   requested. Permissions need to be granted on each Mac.
3. In **Devices**, enable **Modify events** for the keypad. It may have an unnamed
   entry: use **Karabiner-EventViewer → Devices** to find vendor `0x1189`, product
   `0x8890` (decimal `4489` and `34960`). If it has separate keyboard/media entries,
   enable those too.
4. Enable **Modify events** for the main keyboard as well, so Karabiner can see
   Left Control when you combine it with a keypad press. The imported rules below
   change only keypad events.

## 4. Add the two Karabiner rules

In Finder, press **Command + Shift + G** and open:

```text
~/.config/karabiner/assets/complex_modifications/
```

Copy **`integrations/karabiner.json` from this repository** into that folder. If
the folder does not exist, create it. Or, from Terminal inside the repository:

```sh
mkdir -p ~/.config/karabiner/assets/complex_modifications
cp integrations/karabiner.json ~/.config/karabiner/assets/complex_modifications/local-meet-pad.json
```

Then open Karabiner → **Complex Modifications → Add predefined rule** (called
**Add rule** in some versions). Find **Local Meet Pad: Meeting mode** and enable
both rules:

- **Macropad: Left Control + Key 1 toggles Meeting mode**
- **Macropad: Meeting mode local Meet controls**

Copying the file only makes the rules available; **you must enable both** in the
profile you use. This adds the rules without replacing your other settings.

Hold **Left Control on the main keyboard**, press **Key 1 on the keypad**, then
release both. You should see **Macropad: Meeting mode ON**. Repeat the combination
to turn it off; the message disappears. Leave it off until the browser setup is
finished.

## 5. Load the extension in your meeting browser

Use the browser **profile where you open Google Meet**.

1. Open `chrome://extensions` in Chrome, or `vivaldi://extensions` in Vivaldi.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose the **`extension` subfolder** in this
   repository. Choose that subfolder, not the whole repository.
4. Find **Local Meet Pad** in the browser's extensions menu and pin it if you want
   its microphone icon visible. There is no popup panel. Clicking the icon checks
   mic/camera state and reports it in a notification.
5. Reload any Meet tabs that were open before you loaded the extension.

You do not need the third-party “Google Meet – Global Shortcuts” extension.

## 6. Check all four global shortcuts

Open `chrome://extensions/shortcuts` or `vivaldi://extensions/shortcuts` and find
**Local Meet Pad**. Set these exact shortcuts:

| Extension action | Keys to press | Scope |
| --- | --- | --- |
| Toggle microphone | Command + Shift + 7 | **Global** |
| Send and verify thumbs-up reaction | Command + Shift + 8 | **Global** |
| Raise or lower hand | Command + Shift + 9 | **Global** |
| Toggle camera | Command + Shift + 0 | **Global** |

On a Mac, the browser may display these as `⇧⌘7`, `⇧⌘8`, `⇧⌘9`, and `⇧⌘0`.
The symbol order does not matter. Press the number-row keys, not the numeric keypad.

**Check every row, even if most defaults are filled in.** Browser defaults are
suggestions, not guaranteed registrations. In our Vivaldi setup, the hand shortcut
initially showed **Not set** while the other three worked. Click its pencil icon,
press the shortcut, and choose **Global**.

“In Chrome” or “In Vivaldi” scope will not work while another app is in front.
The “Activate the extension” row is not one of these four controls and can stay
unassigned. If another app or extension owns a shortcut, resolve that conflict.
Changing a combination requires changing the corresponding Karabiner output too.

## 7. Enable result notifications

In **macOS System Settings → Notifications**, allow notifications for your meeting
browser. If Focus/Do Not Disturb is enabled, allow that browser or turn Focus off
for the first test. Allow browser notifications if the browser prompts you too.

An action's result appears as a desktop notification. The toolbar also shows a
brief badge; it clears after eight seconds. A badge is a recent result, not a
continuously updated mic/camera indicator.

## 8. Test in an empty Meet call

1. Open Meet with **English interface controls** and join a call by yourself.
   The pre-join preview does not count as an active call.
2. Click the extension's toolbar icon. Its notification should report your current
   microphone and camera state without changing either.
3. Enable Meeting mode with **Left Control + Key 1**.
4. Switch to another app, such as Notes. Test these controls one at a time:

| Control | Meeting mode ON | Meeting mode OFF |
| --- | --- | --- |
| Key 1 | Mute/unmute your Meet microphone | F16 passes through |
| Key 2 | Send 👍 | F17 passes through |
| Key 3 | Raise/lower your hand | F18 passes through |
| Knob press | Camera on/off | System sound mute/unmute |
| Knob left/right | System volume down/up | System volume down/up |

5. Compare each result notification with Meet's actual controls. Toggle mic,
   camera, and hand again to restore the original state if needed.
6. Turn Meeting mode off and confirm that knob press returns to system sound mute.

System sound mute affects **what you hear**. Meet microphone mute affects **what
other participants hear from you**. They are separate controls.

## Everyday use

- Join your call, turn Meeting mode on, and work in any app.
- Turn Meeting mode off when you finish the call.
- After restarting Karabiner or the Mac, turn Meeting mode on again when needed.
- Keep Karabiner and the meeting browser running. The keypad still has its base
  signals when they are not running, but the meeting actions need both.

## What “confirmed” means

For mic, camera, and hand controls, the extension checks that Meet's button state
changed. For 👍, it looks for a new acknowledgement attributed specifically to you.
An emoji from another participant does not count.

If it cannot verify the expected result, it reports **NOT confirmed** and does
not automatically try again. The action may still have happened; check Meet
before retrying. Confirmation is evidence from Meet's interface at that moment,
not a guarantee about hardware or what other participants received.

Meet interface changes or different languages may require an update to the local
extension. If the reaction was sent but no recognizable acknowledgement appears,
the extension will report it as unconfirmed.

## If something does not work

| Symptom | What to check |
| --- | --- |
| Mode toggle does nothing | Enable both Karabiner rules and Modify events for the pad and main keyboard. Use **Left** Control. |
| Pad is hard to identify | Find `1189:8890` in EventViewer → Devices. Different USB ports do not require changing these rules. |
| One key does nothing and no notification appears | Its browser shortcut may be **Not set**. Check that row and its **Global** scope. |
| Actions work only with the browser in front | Set all four shortcut scopes to **Global**. |
| Knob press changes system mute during Meeting mode | Check the pad's knob emits media **mute**, that its events are enabled, and that the action rule is enabled. |
| No active call detected | Join a call, use English controls, and reload the Meet tab after loading/reloading the extension. |
| Multiple active calls / reload-tabs error | Leave extra calls; reload or close stale Meet tabs. The extension refuses to guess a target. |
| An action works but its notification is missing | Check macOS notification permissions and Focus settings for that browser. |
| “Cannot safely identify” or “NOT confirmed” | Check the result in Meet before retrying. The selector or confirmation may need adjustment. |
| New laptop sends the wrong raw keys | See the replacement-keypad section below. |

To isolate a problem, press the corresponding **Command + Shift + number** on
your main keyboard. If that works, check the keypad/Karabiner side. If it does
not, check browser shortcut registration, extension loading, and the Meet tab.

## Programming a replacement keypad

Skip this for the already-configured keypad: its layout stays in its memory when
you move it to another laptop.

For the same **CH57x, three-key/one-knob model `1189:8890`**, the complete base
layout is saved in [`integrations/macropad.yaml`](../integrations/macropad.yaml).
Install [ch57x-keyboard-tool](https://github.com/kriomant/ch57x-keyboard-tool)
using its instructions, then run from the repository folder:

```sh
ch57x-keyboard-tool validate < integrations/macropad.yaml
ch57x-keyboard-tool upload < integrations/macropad.yaml
```

This writes the base keys/knob actions into the device. In EventViewer, with Meeting
mode off, verify F16, F17, F18, media mute, and volume down/up. A different keypad
model may need its own programming and device IDs in the Karabiner rules.

## Updates and removal

The extension is loaded from local files and does not automatically update.
After downloading changes (or running `git pull`), click **Reload** on Local Meet
Pad in your browser's Extensions page, then reload Meet tabs. Recheck all four
shortcuts. If the Karabiner rules changed, copy the updated file and replace the
enabled copies of those two rules in Karabiner; copying the file alone does not
update rules already enabled in your profile.

To remove the setup, disable the two Local Meet Pad rules in Karabiner and remove
the extension. Disable the action rule before removing the extension so its
generated shortcuts do not reach the app you are working in.

For a complete copy of all your Karabiner settings, Karabiner also supports
[export/import of `karabiner.json`](https://karabiner-elements.pqrs.org/docs/manual/operation/export/).
That replaces the destination configuration; the two-rule method above is better
when the other laptop already has its own mappings. Browser extensions, shortcut
registrations, and macOS permissions still need setup separately.
