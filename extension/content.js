(() => {
  "use strict";
  if (location.origin !== "https://meet.google.com" || window.top !== window) return;
  const controls = LocalMeetPad.create(document, window);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.channel !== "local-meet-pad/v1") return false;
    if (message.type === "probe") {
      respond({ ok: true, ...controls.probe() });
      return false;
    }
    if (message.type !== "execute" || !["microphone", "camera", "thumbs-up", "hand"].includes(message.action)) {
      respond({ ok: false, error: "Invalid command." });
      return false;
    }
    controls.execute(message.action).then(
      (result) => respond({ ok: true, ...result }),
      (error) => respond({ ok: false, error: error.message }),
    );
    return true;
  });
})();
