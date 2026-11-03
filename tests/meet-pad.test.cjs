const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../extension');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function fixture({ active = true, timeout = 25 } = {}) {
  const observers = new Set();
  const document = {
    documentElement: {}, elements: [],
    querySelectorAll(selector) {
      return selector === 'button, [role="button"]' ? this.elements.filter((element) => element.isButton) : this.elements;
    },
  };
  const window = {
    getComputedStyle: (button) => ({ display: button.hidden ? 'none' : 'block', visibility: 'visible' }),
    setTimeout, clearTimeout,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
  };
  function button(label, onClick = () => {}, hidden = false) {
    const attributes = { 'aria-label': label };
    const result = {
      hidden, disabled: false, clicks: 0, textContent: '', isButton: true,
      getClientRects() { return this.hidden ? [] : [{}]; },
      getAttribute(name) { return attributes[name] ?? null; },
      setAttribute(name, value) { attributes[name] = value; observers.forEach((o) => o.callback()); },
      click() { this.clicks++; onClick(this); },
    };
    document.elements.push(result);
    return result;
  }
  if (active) button('Leave call');
  const context = vm.createContext({});
  vm.runInContext(source('controls.js'), context);
  const controls = context.LocalMeetPad.create(document, window, timeout);
  return { controls, document, window, button, observers };
}

test('microphone mute and unmute each click once and verify resulting Meet state', async () => {
  const f = fixture();
  const mic = f.button('Turn off microphone (⌘ + d)', (button) => {
    button.setAttribute('aria-label', button.clicks === 1 ? 'Turn on microphone (⌘ + d)' : 'Turn off microphone (⌘ + d)');
  });
  assert.equal((await f.controls.execute('microphone')).state, 'muted');
  assert.equal((await f.controls.execute('microphone')).state, 'live');
  assert.equal(mic.clicks, 2);
  assert.equal(f.observers.size, 0);
});

test('asynchronous microphone state changes are observed', async () => {
  const f = fixture();
  f.button('Turn off microphone', (button) => {
    setTimeout(() => button.setAttribute('aria-label', 'Turn on microphone'), 5);
  });
  assert.equal((await f.controls.execute('microphone')).state, 'muted');
});

test('camera on/off and hand raise/lower verify the resulting state', async () => {
  for (const [action, before, after, expected] of [
    ['camera', 'Turn on camera', 'Turn off camera', 'cameraOn'],
    ['camera', 'Turn off camera', 'Turn on camera', 'cameraOff'],
    ['hand', 'Raise hand', 'Lower hand', 'up'],
    ['hand', 'Lower hand', 'Raise hand', 'down'],
  ]) {
    const f = fixture();
    f.button(before, (button) => button.setAttribute('aria-label', after));
    assert.equal((await f.controls.execute(action)).state, expected);
  }
});

test('preview controls are never clicked before joining a call', async () => {
  const f = fixture({ active: false });
  const mic = f.button('Turn on microphone');
  await assert.rejects(f.controls.execute('microphone'), /No active call/);
  assert.equal(mic.clicks, 0);
});

test('unknown, duplicate, and disabled microphone controls fail without clicking', async () => {
  for (const variant of ['unknown', 'duplicate', 'disabled', 'conflicting']) {
    const f = fixture();
    const mic = f.button(variant === 'unknown' ? 'Microphone settings' : 'Turn on microphone');
    if (variant === 'duplicate') f.button('Turn on microphone');
    if (variant === 'conflicting') f.button('Turn off microphone');
    if (variant === 'disabled') mic.disabled = true;
    await assert.rejects(f.controls.execute('microphone'), /Cannot safely identify/);
    assert.equal(mic.clicks, 0);
  }
});

test('hidden duplicate controls do not cause the visible microphone to be misidentified', async () => {
  const f = fixture();
  const hidden = f.button('Turn on microphone', () => {}, true);
  f.button('Turn off microphone', (button) => button.setAttribute('aria-label', 'Turn on microphone'));
  assert.equal((await f.controls.execute('microphone')).state, 'muted');
  assert.equal(hidden.clicks, 0);
});

test('failed mic, camera, and hand toggles are explicitly unconfirmed and never retried', async () => {
  for (const [action, label] of [['microphone', 'Turn off microphone'], ['camera', 'Turn off camera'], ['hand', 'Raise hand']]) {
    const f = fixture();
    const button = f.button(label);
    await assert.rejects(f.controls.execute(action), /NOT confirmed/);
    assert.equal(button.clicks, 1);
    assert.equal(f.observers.size, 0);
  }
});

test('concurrent button presses do not double toggle', async () => {
  const f = fixture();
  const mic = f.button('Turn off microphone');
  const first = f.controls.execute('microphone');
  await assert.rejects(f.controls.execute('microphone'), /Previous action/);
  await assert.rejects(first, /NOT confirmed/);
  assert.equal(mic.clicks, 1);
});

test('call ending while action is pending aborts confirmation', async () => {
  const f = fixture();
  f.button('Turn off microphone', () => {
    setTimeout(() => {
      f.document.elements[0].hidden = true;
      f.observers.forEach((observer) => observer.callback());
    }, 5);
  });
  await assert.rejects(f.controls.execute('microphone'), /Call ended/);
});

test('reaction succeeds only after a new acknowledgement explicitly attributed to you', async () => {
  const f = fixture();
  let thumbs;
  f.button('Send a reaction', () => {
    thumbs = f.button('👍', () => {
      const ack = f.button('');
      ack.isButton = false;
      ack.setAttribute('aria-label', 'You reacted with 👍');
    });
  });
  const result = await f.controls.execute('thumbs-up');
  assert.equal(thumbs.clicks, 1);
  assert.equal(result.state, 'confirmed');
  assert.match(result.message, /acknowledgement/);
});

test('a stale acknowledgement or another participant’s reaction never confirms success', async () => {
  for (const text of ['You reacted with 👍', 'Alice reacted with 👍', '👍']) {
    const f = fixture();
    const ack = f.button(text);
    ack.isButton = false;
    const thumbs = f.button('👍', () => {
      ack.setAttribute('aria-label', text);
    });
    await assert.rejects(f.controls.execute('thumbs-up'), /NOT confirmed/);
    assert.equal(thumbs.clicks, 1);
  }
});

test('a reaction click without a visible acknowledgement fails without automatic resend', async () => {
  const f = fixture();
  const thumbs = f.button('👍');
  await assert.rejects(f.controls.execute('thumbs-up'), /No automatic retry/);
  assert.equal(thumbs.clicks, 1);
  assert.equal(f.observers.size, 0);
});

test('unknown commands cannot invoke arbitrary page actions', async () => {
  const f = fixture();
  await assert.rejects(f.controls.execute('leave-call'), /Unknown action/);
  assert.equal(f.document.elements[0].clicks, 0);
});

function backgroundFixture(tabs, handlers) {
  const sent = [], notifications = [], badges = [], listeners = {};
  const chrome = {
    runtime: {
      id: 'local-id', getURL: (file) => 'chrome-extension://local-id/' + file,
      onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
    },
    commands: {
      onCommand: { addListener: (listener) => { listeners.command = listener; } },
      getAll: async () => ['microphone', 'camera', 'thumbs-up', 'hand'].map((name) => ({ name, shortcut: 'assigned' })),
    },
    tabs: {
      query: async (query) => { assert.equal(query.url, 'https://meet.google.com/*'); return tabs; },
      sendMessage: async (id, message, options) => {
        assert.equal(options.frameId, 0);
        assert.equal(message.channel, 'local-meet-pad/v1');
        sent.push({ id, ...message });
        return handlers[id](message);
      },
    },
    action: {
      onClicked: { addListener: (listener) => { listeners.clicked = listener; } },
      setBadgeText: async (data) => { badges.push(data.text); },
      setBadgeBackgroundColor: async () => {}, setTitle: async () => {},
    },
    notifications: { create: async (_, data) => { notifications.push(data.message); } },
  };
  const context = vm.createContext({ chrome, setTimeout, clearTimeout });
  vm.runInContext(source('background.js'), context);
  return { context, chrome, sent, notifications, badges, listeners };
}

test('background action targets the only actual call, ignoring other landing tabs', async () => {
  const f = backgroundFixture([{ id: 1 }, { id: 2 }], {
    1: () => ({ ok: true, inCall: false }),
    2: (message) => message.type === 'probe' ? { ok: true, inCall: true }
      : { ok: true, action: 'microphone', state: 'muted', message: 'Microphone MUTED' },
  });
  const result = await vm.runInContext('run("microphone")', f.context);
  assert.equal(result.ok, true);
  assert.deepEqual(f.sent.filter((m) => m.type === 'execute').map((m) => m.id), [2]);
  assert.deepEqual(f.badges, ['MUTE']);
});

test('multiple active calls refuse actions regardless of which app has focus', async () => {
  const f = backgroundFixture([{ id: 1 }, { id: 2 }], {
    1: () => ({ ok: true, inCall: true }), 2: () => ({ ok: true, inCall: true }),
  });
  const result = await vm.runInContext('run("camera")', f.context);
  assert.equal(result.ok, false);
  assert.match(result.error, /Multiple active/);
  assert.equal(f.sent.filter((m) => m.type === 'execute').length, 0);
});

test('an unreachable Meet tab causes refusal rather than guessing the target', async () => {
  const f = backgroundFixture([{ id: 1 }, { id: 2 }], {
    1: () => ({ ok: true, inCall: true }), 2: () => { throw new Error('no receiver'); },
  });
  const result = await vm.runInContext('run("microphone")', f.context);
  assert.match(result.error, /Reload your Meet tabs/);
  assert.equal(f.sent.filter((m) => m.type === 'execute').length, 0);
});

test('failed verification reaches desktop feedback and never shows a mute badge', async () => {
  const f = backgroundFixture([{ id: 1 }], {
    1: (message) => message.type === 'probe' ? { ok: true, inCall: true }
      : { ok: false, error: 'Action NOT confirmed.' },
  });
  assert.equal((await vm.runInContext('run("microphone")', f.context)).ok, false);
  assert.deepEqual(f.badges, ['!']);
  assert.match(f.notifications[0], /NOT confirmed/);
});

test('toolbar click checks state without performing any action or opening a popup', async () => {
  const f = backgroundFixture([{ id: 1 }], {
    1: () => ({ ok: true, inCall: true, microphone: 'muted', camera: 'cameraOff' }),
  });
  await vm.runInContext('showStatus()', f.context);
  assert.equal(typeof f.listeners.clicked, 'function');
  assert.equal(f.sent.filter((message) => message.type === 'execute').length, 0);
  assert.match(f.notifications[0], /microphone: MUTED; camera: OFF/);
});

test('missing hand shortcut is detected and reported on setup', async () => {
  const f = backgroundFixture([], {});
  f.chrome.commands.getAll = async () => [
    { name: 'microphone', shortcut: 'Command+Shift+7' },
    { name: 'camera', shortcut: 'Command+Shift+0' },
    { name: 'thumbs-up', shortcut: 'Command+Shift+8' },
    { name: 'hand', shortcut: '' },
  ];
  await vm.runInContext('checkShortcuts()', f.context);
  assert.match(f.notifications[0], /Shortcut not assigned: raise\/lower hand/);
  assert.match(f.notifications[0], /Global scope/);
});

test('fully assigned shortcuts do not create setup notifications', async () => {
  const f = backgroundFixture([], {});
  await vm.runInContext('checkShortcuts()', f.context);
  assert.equal(f.notifications.length, 0);
});

test('content message boundary rejects external senders, missing namespace, and unknown actions', () => {
  let listener, executions = 0;
  const window = {}; window.top = window;
  const context = vm.createContext({
    location: { origin: 'https://meet.google.com' }, window, document: {},
    LocalMeetPad: { create: () => ({ probe: () => ({}), execute: () => { executions++; } }) },
    chrome: { runtime: { id: 'local-id', onMessage: { addListener: (fn) => { listener = fn; } } } },
  });
  vm.runInContext(source('content.js'), context);
  listener({ channel: 'local-meet-pad/v1', type: 'execute', action: 'microphone' }, { id: 'other' }, () => assert.fail());
  listener({ type: 'execute', action: 'microphone' }, { id: 'local-id' }, () => assert.fail());
  let response;
  listener({ channel: 'local-meet-pad/v1', type: 'execute', action: 'leave-call' }, { id: 'local-id' }, (r) => { response = r; });
  assert.equal(response.ok, false);
  assert.equal(executions, 0);
});

test('manifest limits access to Meet and all four commands have global scope', () => {
  const manifest = JSON.parse(source('manifest.json'));
  assert.deepEqual(manifest.permissions, ['notifications']);
  assert.deepEqual(manifest.host_permissions, ['https://meet.google.com/*']);
  assert.equal(manifest.update_url, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(Object.keys(manifest.commands).length, 4);
  for (const command of Object.values(manifest.commands)) assert.equal(command.global, true);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
});

test('Karabiner bindings agree with extension commands and camera uses knob mute only in Meeting mode', () => {
  const manifest = JSON.parse(source('manifest.json'));
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../integrations/karabiner.json'), 'utf8')).rules;
  const bindings = rules.filter((rule) => rule.description === 'Macropad: Meeting mode local Meet controls')
    .flatMap((rule) => rule.manipulators);
  const expected = { f16: ['microphone', '7'], f17: ['thumbs-up', '8'], f18: ['hand', '9'], mute: ['camera', '0'] };
  assert.equal(bindings.length, 4);
  for (const binding of bindings) {
    const [command, key] = expected[binding.from.key_code || binding.from.consumer_key_code];
    assert.equal(binding.to[0].key_code, key);
    assert.equal(manifest.commands[command].suggested_key.mac, 'Command+Shift+' + key);
    assert.equal(binding.conditions.find((c) => c.type === 'variable_if').value, 1);
    assert.deepEqual(binding.conditions.find((c) => c.type === 'device_if').identifiers,
      [{ vendor_id: 4489, product_id: 34960 }]);
    assert.equal(binding.to[0].repeat, false);
  }
});
