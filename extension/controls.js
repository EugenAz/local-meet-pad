/* Runs in Chrome's isolated content-script world. No page messaging or network. */
(() => {
  "use strict";
  const suffix = "(?:\\s*\\([^)]*\\))?\\s*$";
  const label = (text) => new RegExp("^(?:" + text + ")" + suffix, "i");
  // Deliberately conservative: unknown/localized labels fail without clicking.
  const names = {
    leave: label("leave call|leave meeting"),
    muted: label("turn on microphone|unmute microphone"),
    live: label("turn off microphone|mute microphone"),
    cameraOff: label("turn on camera"),
    cameraOn: label("turn off camera"),
    down: label("raise hand|raise your hand"),
    up: label("lower hand|lower your hand"),
    picker: label("send a reaction|reactions|open reactions"),
    thumbs: label("👍\\uFE0F?|thumbs up|send thumbs up reaction"),
  };

  function create(document, window, timeout = 2500) {
    let busy = false;
    function visible(button) {
      const style = window.getComputedStyle(button);
      return button.getClientRects().length > 0 &&
        style.display !== "none" && style.visibility !== "hidden" &&
        style.visibility !== "collapse";
    }
    function buttons(pattern) {
      return [...document.querySelectorAll('button, [role="button"]')].filter((button) => {
        if (!visible(button)) return false;
        const name = button.getAttribute("aria-label") || button.getAttribute("data-tooltip") ||
          button.getAttribute("title") || button.textContent.trim();
        return pattern.test(name);
      });
    }
    function unique(pattern) {
      const matches = buttons(pattern);
      return matches.length === 1 ? matches[0] : null;
    }
    function available(button) {
      return button && !button.disabled && button.getAttribute("aria-disabled") !== "true";
    }
    function state(kind) {
      const states = kind === "microphone" ? ["muted", "live"]
        : kind === "camera" ? ["cameraOff", "cameraOn"] : ["down", "up"];
      const matches = states.flatMap((value) => buttons(names[value]).map((button) => ({ value, button })));
      return matches.length === 1 ? matches[0] : null;
    }
    function inCall() { return Boolean(unique(names.leave)); }
    function probe() {
      const active = inCall();
      return {
        inCall: active,
        microphone: active ? state("microphone")?.value ?? "unknown" : null,
        camera: active ? state("camera")?.value ?? "unknown" : null,
      };
    }
    function waitFor(getter) {
      return new Promise((resolve, reject) => {
        let observer;
        let timer;
        function finish(error, value) {
          observer?.disconnect();
          window.clearTimeout(timer);
          if (error) reject(error); else resolve(value);
        }
        function check() {
          try {
            if (!inCall()) throw new Error("Call ended; action could not be confirmed.");
            const value = getter();
            if (value) finish(null, value);
          } catch (error) { finish(error); }
        }
        observer = new window.MutationObserver(check);
        observer.observe(document.documentElement, {
          subtree: true, childList: true, attributes: true, characterData: true,
          attributeFilter: ["aria-label", "aria-disabled", "aria-hidden", "data-tooltip", "title", "disabled", "style", "class"],
        });
        timer = window.setTimeout(() => finish(new Error("Action NOT confirmed. Check the controls in Meet.")), timeout);
        check();
      });
    }
    async function toggle(kind) {
      const before = state(kind);
      if (!before || !available(before.button)) {
        throw new Error("Cannot safely identify the " + kind + " control. Nothing was changed.");
      }
      const expected = kind === "microphone"
        ? (before.value === "muted" ? "live" : "muted")
        : kind === "camera" ? (before.value === "cameraOn" ? "cameraOff" : "cameraOn")
        : (before.value === "up" ? "down" : "up");
      before.button.click();
      const after = await waitFor(() => {
        const current = state(kind);
        return current?.value === expected ? current : null;
      });
      if (kind === "microphone") {
        return { action: kind, state: after.value, message: after.value === "muted" ? "Microphone MUTED — confirmed by Meet" : "Microphone LIVE — confirmed by Meet" };
      }
      if (kind === "camera") {
        return { action: kind, state: after.value, message: after.value === "cameraOff" ? "Camera OFF — confirmed by Meet" : "Camera ON — confirmed by Meet" };
      }
      return { action: kind, state: after.value, message: after.value === "up" ? "Hand raised — confirmed by Meet" : "Hand lowered — confirmed by Meet" };
    }
    function confirmReaction(click) {
      // An emoji appearing in the room is not enough: it could be someone else's.
      const selector = '[role="status"], [role="alert"], [aria-live], [aria-label]';
      const acknowledgement = /^(?:you (?:reacted with|sent)(?: (?:a|the))? (?:👍\uFE0F?|thumbs[ -]up)(?: reaction)?|your (?:👍\uFE0F?|thumbs[ -]up) reaction(?: (?:was )?sent)?)[.!]?$/iu;
      const text = (element) => (element.getAttribute("aria-label") || element.textContent || "").trim();
      const existing = new WeakMap([...document.querySelectorAll(selector)].map((element) => [element, text(element)]));
      return new Promise((resolve, reject) => {
        let observer;
        let timer;
        let settled = false;
        function finish(error) {
          if (settled) return;
          settled = true;
          observer.disconnect();
          window.clearTimeout(timer);
          if (error) reject(error); else resolve();
        }
        observer = new window.MutationObserver(() => {
          if (!inCall()) { finish(new Error("Call ended; reaction NOT confirmed.")); return; }
          for (const element of document.querySelectorAll(selector)) {
            const value = text(element);
            if (visible(element) && acknowledgement.test(value) && existing.get(element) !== value) {
              finish(); return;
            }
            // Detect a new acknowledgement even if Meet reuses a live-region node.
            existing.set(element, value);
          }
        });
        observer.observe(document.documentElement, {
          subtree: true, childList: true, characterData: true, attributes: true,
          attributeFilter: ["aria-label"],
        });
        timer = window.setTimeout(() => finish(new Error("Thumbs-up NOT confirmed. It may have been sent; check Meet. No automatic retry.")), timeout);
        try { click(); } catch (error) { finish(error); }
      });
    }
    async function thumbsUp() {
      let thumbs = unique(names.thumbs);
      if (!available(thumbs)) {
        const picker = unique(names.picker);
        if (!available(picker) || picker.getAttribute("aria-expanded") === "true") {
          throw new Error("Thumbs-up reaction is unavailable. Nothing was sent.");
        }
        picker.click();
        thumbs = await waitFor(() => {
          const button = unique(names.thumbs);
          return available(button) ? button : null;
        });
      }
      await confirmReaction(() => thumbs.click());
      return { action: "thumbs-up", state: "confirmed", message: "👍 confirmed by Meet’s acknowledgement of your reaction" };
    }
    async function execute(action) {
      if (!["microphone", "camera", "hand", "thumbs-up"].includes(action)) throw new Error("Unknown action.");
      if (busy) throw new Error("Previous action is still being checked.");
      if (!inCall()) throw new Error("No active call detected. Nothing was changed.");
      busy = true;
      try { return await (action === "thumbs-up" ? thumbsUp() : toggle(action)); }
      finally { busy = false; }
    }
    return Object.freeze({ probe, execute });
  }
  globalThis.LocalMeetPad = Object.freeze({ create });
})();
