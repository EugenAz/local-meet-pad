"use strict";
const CHANNEL = "local-meet-pad/v1";
const ACTIONS = ["microphone", "camera", "thumbs-up", "hand"];
const CONFIRMED_STATES = {
  microphone: ["muted", "live"], camera: ["cameraOff", "cameraOn"],
  hand: ["up", "down"], "thumbs-up": ["confirmed"],
};
let busy = false;
let badgeTimer;

async function send(tabId, message) {
  let timer;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, { channel: CHANNEL, ...message }, { frameId: 0 }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Meet did not respond.")), 6000); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function findCall() {
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  let unreachable = false;
  const calls = (await Promise.all(tabs.map(async (tab) => {
    if (!Number.isInteger(tab.id)) return null;
    try {
      const state = await send(tab.id, { type: "probe" });
      return state?.ok === true && state.inCall === true
        ? { id: tab.id, microphone: state.microphone, camera: state.camera } : null;
    } catch { unreachable = true; return null; }
  }))).filter(Boolean);
  if (calls.length > 1) throw new Error("Multiple active Meet calls. No action taken; leave the extra call first.");
  // An unreachable tab could contain another call: never guess which call to control.
  if (unreachable) throw new Error("Reload your Meet tabs so all calls can be checked. No action taken.");
  if (!calls.length) throw new Error("No active Meet call detected. Join a call with English controls first.");
  return calls[0];
}

async function feedback(message, state = "error", action = "") {
  const badge = action === "microphone" ? (state === "muted" ? "MUTE" : state === "live" ? "LIVE" : "!")
    : action === "camera" ? (state === "cameraOff" ? "OFF" : state === "cameraOn" ? "CAM" : "!")
    : state === "error" ? "!" : state === "up" ? "HAND" : "OK";
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color: ["error", "live", "cameraOn"].includes(state) ? "#b42318" : "#175cd3" });
  await chrome.action.setTitle({ title: "Last result (not live status): " + message });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    void chrome.action.setBadgeText({ text: "" });
    void chrome.action.setTitle({ title: "Local Meet Pad — click to check microphone and camera" });
  }, 8000);
  badgeTimer?.unref?.();
  try {
    await chrome.notifications.create("meet-pad-result", {
      type: "basic", iconUrl: "icon.png", title: "Local Meet Pad", message,
    });
  } catch {
    // The toolbar badge and title remain usable if macOS blocks notifications.
  }
}

async function run(action) {
  if (!ACTIONS.includes(action)) return { ok: false, error: "Invalid command." };
  if (busy) return { ok: false, error: "Previous action is still being checked." };
  busy = true;
  try {
    const call = await findCall();
    const result = await send(call.id, { type: "execute", action });
    if (result?.ok !== true || result.action !== action || !CONFIRMED_STATES[action].includes(result.state) ||
        typeof result.message !== "string") {
      throw new Error(result?.error || "Action NOT confirmed. Check Meet before relying on mute.");
    }
    await feedback(result.message, result.state, action);
    return result;
  } catch (error) {
    const message = error.message || "Action NOT confirmed. Check Meet.";
    await feedback(message);
    return { ok: false, error: message };
  } finally { busy = false; }
}

chrome.commands.onCommand.addListener((action) => { void run(action); });

async function showStatus() {
  try {
    const call = await findCall();
    const microphone = { muted: "MUTED", live: "LIVE" }[call.microphone] || "UNKNOWN";
    const camera = { cameraOff: "OFF", cameraOn: "ON" }[call.camera] || "UNKNOWN";
    await feedback("Checked now — microphone: " + microphone + "; camera: " + camera,
      microphone === "UNKNOWN" || camera === "UNKNOWN" ? "error" : "status");
  } catch (error) { await feedback(error.message); }
}
chrome.action.onClicked.addListener(() => { void showStatus(); });

async function checkShortcuts() {
  const commands = await chrome.commands.getAll();
  const missing = ACTIONS.filter((name) => !commands.some((command) => command.name === name && command.shortcut));
  if (missing.length) {
    const labels = { microphone: "microphone", camera: "camera", hand: "raise/lower hand", "thumbs-up": "thumbs up" };
    await feedback("Shortcut not assigned: " + missing.map((name) => labels[name]).join(", ") +
      ". Open the browser’s extension shortcut settings and assign it with Global scope.");
  }
}
chrome.runtime.onInstalled.addListener((details) => {
  // Check first install only: respect shortcuts deliberately cleared later.
  if (details.reason === "install") void checkShortcuts();
});
