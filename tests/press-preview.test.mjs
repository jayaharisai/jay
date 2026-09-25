import assert from "node:assert/strict";
import { test } from "node:test";
import { createPressController } from "../movies/press-preview.mjs";

function setup() {
  const doc = new globalThis.EventTarget();
  const env = new globalThis.EventTarget();
  const timers = new Map();
  let id = 0;
  let shown = 0;
  let hidden = 0;
  Object.assign(env, {
    AbortController: globalThis.AbortController,
    setTimeout(callback, delay) {
      timers.set(++id, { callback, delay });
      return id;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
  });
  const trigger = {
    isConnected: true,
    closest(selector) {
      if (selector === "button[data-movie-details]") return trigger;
      if (selector === ".movie-card") return {};
      return null;
    },
  };
  const dispose = createPressController(doc, env, {
    show(target) {
      assert.equal(target, trigger);
      shown++;
    },
    hide() {
      hidden++;
    },
  });
  return {
    dispose,
    timers,
    get shown() {
      return shown;
    },
    get hidden() {
      return hidden;
    },
    send(type, properties = {}) {
      const event = new globalThis.Event(type, { cancelable: true });
      const fields = {
        target: trigger,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: 50,
        clientY: 80,
        detail: 1,
        ...properties,
      };
      for (const [name, value] of Object.entries(fields)) {
        Object.defineProperty(event, name, { value });
      }
      doc.dispatchEvent(event);
      return event;
    },
    hold() {
      for (const [key, timer] of [...timers]) {
        if (timer.delay !== 420) continue;
        timers.delete(key);
        timer.callback();
      }
    },
  };
}

test("a touch hold previews the card and suppresses only its release click", () => {
  const context = setup();
  context.send("pointerdown");
  assert.equal(context.shown, 0);
  context.hold();
  assert.equal(context.shown, 1);
  context.send("pointerup");
  assert.equal(context.hidden, 1);
  assert.equal(context.send("click").defaultPrevented, true);
  context.send("pointerdown");
  context.send("pointerup");
  assert.equal(context.send("click").defaultPrevented, false);
  context.dispose();
});

test("quick taps and mouse presses keep normal click behavior", () => {
  for (const pointerType of ["touch", "mouse", "pen"]) {
    const context = setup();
    context.send("pointerdown", { pointerType });
    if (pointerType !== "touch") context.hold();
    context.send("pointerup");
    context.hold();
    assert.equal(context.shown, 0);
    assert.equal(context.send("click").defaultPrevented, false);
    context.dispose();
  }
});

test("scrolling, dragging, cancellation and multitouch cancel pending holds", () => {
  for (const [type, properties] of [
    ["scroll", {}],
    ["pointermove", { clientX: 70 }],
    ["pointercancel", {}],
    ["pointerdown", { pointerId: 2, isPrimary: false }],
  ]) {
    const context = setup();
    context.send("pointerdown");
    context.send(type, properties);
    context.hold();
    assert.equal(context.shown, 0);
    context.dispose();
  }
});

test("navigation and scrolling dismiss a visible preview", () => {
  for (const type of ["movie-page-change", "scroll", "visibilitychange"]) {
    const context = setup();
    context.send("pointerdown");
    context.hold();
    context.send(type);
    assert.equal(context.hidden, 1);
    context.dispose();
  }
});

test("keyboard activation remains available after a hold", () => {
  const context = setup();
  context.send("pointerdown");
  context.hold();
  context.send("pointerup");
  assert.equal(context.send("click", { detail: 0 }).defaultPrevented, false);
  context.dispose();
});

test("native context menus are prevented only during a card touch", () => {
  const context = setup();
  assert.equal(context.send("contextmenu").defaultPrevented, false);
  context.send("pointerdown");
  assert.equal(context.send("contextmenu").defaultPrevented, true);
  context.send("pointercancel");
  assert.equal(context.send("contextmenu").defaultPrevented, false);
  context.dispose();
});

test("disposal clears timers, previews and event listeners", () => {
  const context = setup();
  context.send("pointerdown");
  context.hold();
  context.send("pointerup");
  context.dispose();
  assert.equal(context.timers.size, 0);
  assert.equal(context.hidden, 1);
  context.send("pointerdown");
  context.hold();
  assert.equal(context.shown, 1);
});
