import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import {
  createDrawerController,
  readMovieDetails,
} from "../movies/movie-details.mjs";
import { getMovieStory } from "../movies/collection-data.mjs";

function send(target, type, properties = {}) {
  const event = new globalThis.Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(properties)) {
    Object.defineProperty(event, name, { value });
  }
  target.dispatchEvent(event);
  return event;
}

function setup({ reduced = false, animated = true } = {}) {
  const running = new Set();
  const allAnimations = [];
  const frames = new Map();
  const scrolls = [];
  let frameId = 0;
  const doc = new globalThis.EventTarget();
  doc.documentElement = {
    clientWidth: 375,
    style: { overflow: "auto", overscrollBehavior: "auto" },
  };
  doc.body = {
    style: {
      position: "relative",
      top: "",
      left: "",
      width: "",
      paddingRight: "5px",
      overflow: "visible",
    },
  };
  const originalStyle = { ...doc.body.style };
  const originalRootStyle = { ...doc.documentElement.style };
  const motion = new globalThis.EventTarget();
  motion.matches = reduced;
  class Part extends globalThis.EventTarget {
    constructor() {
      super();
      this.ownerDocument = doc;
      this.style = { transform: "none", opacity: "1" };
      this.isConnected = true;
      if (!animated) this.animate = undefined;
    }
    closest() {
      return null;
    }
    focus() {
      doc.activeElement = this;
    }
    remove() {
      this.isConnected = false;
    }
    showModal() {
      this.transformAtShow = parts.panel.style.transform;
      this.open = true;
      this.modalCalls = (this.modalCalls || 0) + 1;
    }
    close() {
      this.open = false;
      send(this, "close");
    }
    getBoundingClientRect() {
      return { height: 600 };
    }
    setPointerCapture(id) {
      this.capture = id;
    }
    hasPointerCapture(id) {
      return this.capture === id;
    }
    releasePointerCapture(id) {
      this.capture = undefined;
      send(this, "lostpointercapture", { pointerId: id });
    }
    animate(keyframes, options) {
      let finish;
      let cancel;
      const finished = new Promise((resolve, reject) => {
        finish = resolve;
        cancel = reject;
      });
      const animation = {
        keyframes,
        options,
        finished,
        finish() {
          running.delete(animation);
          finish();
        },
        cancel() {
          running.delete(animation);
          cancel(new Error("Animation cancelled"));
        },
      };
      running.add(animation);
      allAnimations.push(animation);
      return animation;
    }
  }
  const names = [
    "dialog",
    "panel",
    "scrim",
    "handle",
    "closeButton",
    "image",
    "title",
    "story",
    "content",
  ];
  const parts = Object.fromEntries(names.map((name) => [name, new Part()]));
  const opener = new Part();
  const env = {
    AbortController: globalThis.AbortController,
    Event: globalThis.Event,
    scrollX: 0,
    scrollY: 1290,
    innerWidth: 390,
    getComputedStyle: (element) => element.style,
    matchMedia: () => motion,
    scrollTo(x, y) {
      scrolls.push([x, y]);
      env.scrollX = x;
      env.scrollY = y;
    },
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  const drawer = createDrawerController(parts, env);
  const movie = {
    title: "A Quiet Summer",
    image: "/jay/movies/posters/wp6908042.webp",
    width: 860,
    height: 405,
    position: "22% 50%",
    story: "A clearly fictional sample story.",
  };
  return {
    ...parts,
    doc,
    env,
    motion,
    originalStyle,
    originalRootStyle,
    opener,
    drawer,
    movie,
    running,
    allAnimations,
    frames,
    scrolls,
    async settle() {
      [...running].forEach((animation) => animation.finish());
      await setImmediate();
    },
    flushDrag() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    drag(type, y, time, extra = {}) {
      return send(parts.handle, type, {
        pointerId: 7,
        isPrimary: true,
        button: 0,
        clientY: y,
        timeStamp: time,
        ...extra,
      });
    },
  };
}

test("drawer opens natively with the chosen details, then restores focus and exact scrolling", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  assert.equal(c.dialog.open, true);
  assert.equal(c.doc.activeElement, c.closeButton);
  assert.equal(c.title.textContent, c.movie.title);
  assert.equal(c.story.textContent, c.movie.story);
  assert.equal(c.image.src, c.movie.image);
  assert.equal(c.image.style.objectPosition, "22% 50%");
  assert.equal(c.doc.body.style.position, c.originalStyle.position);
  assert.equal(c.doc.body.style.top, c.originalStyle.top);
  assert.equal(c.doc.body.style.width, c.originalStyle.width);
  assert.equal(c.doc.body.style.paddingRight, c.originalStyle.paddingRight);
  assert.equal(c.doc.documentElement.style.overflow, "hidden");
  assert.equal(c.doc.body.style.overflow, "hidden");
  assert.equal(c.dialog.transformAtShow, "translate3d(0, 0, 0)");
  assert.equal(
    c.allAnimations[0].keyframes[0].transform,
    "translate3d(0, 100%, 0)",
  );
  assert.equal(c.allAnimations[0].options.duration, 460);
  assert.equal(c.allAnimations[0].options.fill, "both");
  await c.settle();
  send(c.closeButton, "click");
  assert.equal(
    c.dialog.open,
    true,
    "Closing must animate before the dialog is removed",
  );
  assert.equal(c.allAnimations.at(-1).options.duration, 340);
  assert.equal(c.allAnimations.at(-1).options.fill, "both");
  await c.settle();
  assert.equal(c.dialog.open, false);
  assert.deepEqual(c.doc.body.style, c.originalStyle);
  assert.deepEqual(c.doc.documentElement.style, c.originalRootStyle);
  assert.deepEqual(
    c.scrolls,
    [],
    "Do not reset scroll when its position has not changed",
  );
  assert.equal(c.doc.activeElement, c.opener);
  c.drawer.destroy();
});

test("Escape interrupts entry, and reopening cancels an obsolete dismissal", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  assert.equal(send(c.dialog, "cancel").defaultPrevented, true);
  c.drawer.open({ ...c.movie, title: "Another movie" }, c.opener);
  send(c.dialog, "close"); // A queued close event from an earlier opening.
  await c.settle();
  assert.equal(c.dialog.open, true);
  assert.equal(c.dialog.modalCalls, 1);
  assert.equal(c.title.textContent, "Another movie");
  send(c.dialog, "cancel");
  send(c.dialog, "cancel");
  await c.settle();
  assert.equal(c.dialog.open, false);
  assert.equal(c.scrolls.length, 0);
  c.drawer.destroy();
});

test("scroll correction is used only if the browser changed the saved position", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  await c.settle();
  c.env.scrollY = 0;
  c.drawer.close();
  assert.deepEqual(
    c.scrolls,
    [],
    "Keep the page frozen until the exit finishes",
  );
  assert.equal(c.doc.documentElement.style.overflow, "hidden");
  await c.settle();
  assert.deepEqual(c.scrolls, [[0, 1290]]);
  assert.deepEqual(c.doc.documentElement.style, c.originalRootStyle);
  assert.deepEqual(c.doc.body.style, c.originalStyle);
  c.drawer.destroy();
});

test("interrupting entry closes from the visible position, not a new offscreen start", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  const partial = "matrix(1, 0, 0, 1, 180)";
  c.env.getComputedStyle = (element) =>
    element === c.panel
      ? { ...element.style, transform: partial }
      : element.style;
  c.drawer.close();
  const closingPanel = c.allAnimations.at(-2);
  assert.equal(closingPanel.keyframes[0].transform, partial);
  assert.equal(closingPanel.keyframes[1].transform, "translate3d(0, 100%, 0)");
  assert.equal(closingPanel.options.fill, "both");
  await c.settle();
  assert.equal(c.dialog.open, false);
  assert.deepEqual(c.doc.documentElement.style, c.originalRootStyle);
  c.drawer.destroy();
});

test("backdrop closes only when the press also began outside the sheet", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  await c.settle();
  send(c.dialog, "pointerdown", { target: c.content });
  send(c.dialog, "click");
  assert.equal(c.running.size, 0);
  send(c.dialog, "pointerdown");
  send(c.dialog, "click");
  await c.settle();
  assert.equal(c.dialog.open, false);
  c.drawer.destroy();
});

test("short and cancelled drags snap back; a deliberate downward swipe dismisses", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  await c.settle();
  c.drag("pointerdown", 100, 0);
  c.drag("pointermove", 120, 200);
  c.flushDrag();
  assert.equal(c.panel.style.transform, "translate3d(0, 20px, 0)");
  c.drag("pointerup", 120, 250);
  await c.settle();
  assert.equal(c.dialog.open, true);
  assert.equal(c.panel.style.transform, "translate3d(0, 0, 0)");
  c.drag("pointerdown", 100, 300);
  c.drag("pointermove", 300, 500);
  c.flushDrag();
  c.drag("pointercancel", 300, 550);
  await c.settle();
  assert.equal(c.dialog.open, true);
  c.drag("pointerdown", 100, 600);
  c.drag("pointermove", 260, 900);
  c.flushDrag();
  c.drag("pointerup", 260, 950);
  await c.settle();
  assert.equal(c.dialog.open, false);
  assert.equal(c.handle.capture, undefined);
  c.drawer.destroy();
});

test("a quick downward flick dismisses, but a paused or secondary touch does not", async () => {
  for (const pause of [false, true]) {
    const c = setup();
    c.drawer.open(c.movie, c.opener);
    await c.settle();
    c.drag("pointerdown", 100, 0, { isPrimary: false });
    assert.equal(c.handle.capture, undefined);
    c.drag("pointerdown", 100, 0);
    c.drag("pointermove", 145, 30);
    c.flushDrag();
    c.drag("pointerup", 145, pause ? 500 : 40);
    await c.settle();
    assert.equal(c.dialog.open, pause);
    c.drawer.destroy();
  }
});

test("reduced motion and missing animation support retain working open and close controls", async () => {
  for (const options of [{ reduced: true }, { animated: false }]) {
    const c = setup(options);
    c.drawer.open(c.movie, c.opener);
    await c.settle();
    assert.equal(c.allAnimations.length, 0);
    assert.equal(c.dialog.open, true);
    c.drawer.close();
    await c.settle();
    assert.equal(c.dialog.open, false);
    assert.deepEqual(c.doc.body.style, c.originalStyle);
    c.drawer.destroy();
  }
});

test("changing reduced motion mid-animation finishes the current state safely", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  c.motion.matches = true;
  send(c.motion, "change");
  await c.settle();
  assert.equal(c.dialog.open, true);
  assert.equal(c.panel.style.transform, "translate3d(0, 0, 0)");
  c.motion.matches = false;
  c.drawer.close();
  c.motion.matches = true;
  send(c.motion, "change");
  assert.equal(c.dialog.open, false);
  await c.settle();
  c.drawer.destroy();
});

test("navigation and page disposal cannot leave the page locked or a drag frame running", async () => {
  const c = setup();
  c.drawer.open(c.movie, c.opener);
  send(c.doc, "movie-page-change");
  assert.equal(c.dialog.open, false);
  assert.deepEqual(c.doc.body.style, c.originalStyle);
  c.drawer.open(c.movie, c.opener);
  await c.settle();
  c.drag("pointerdown", 100, 0);
  c.drag("pointermove", 190, 200);
  assert.equal(c.frames.size, 1);
  c.drawer.destroy();
  assert.equal(c.frames.size, 0);
  assert.equal(c.running.size, 0);
  assert.equal(c.dialog.isConnected, false);
  assert.deepEqual(c.doc.body.style, c.originalStyle);
  c.drawer.open(c.movie, c.opener);
  send(c.closeButton, "click");
  assert.equal(c.dialog.open, false);
  await c.settle();
});

test("details are read from the tapped card, and sample stories are deterministic", () => {
  const title = { textContent: "  A Quiet Summer  " };
  const image = {
    src: "/poster.webp",
    currentSrc: "/selected-poster.webp",
    width: 424,
    height: 600,
  };
  const card = {
    dataset: {},
    querySelector: (selector) => (selector === "img" ? image : title),
  };
  const trigger = { closest: () => card };
  const movie = readMovieDetails(trigger, {
    getComputedStyle: () => ({ objectPosition: "50% 30%" }),
  });
  assert.equal(movie.title, "A Quiet Summer");
  assert.equal(movie.image, "/selected-poster.webp");
  assert.equal(movie.story, getMovieStory(movie.title));
  assert.ok(movie.story.length > 200);
  assert.equal(readMovieDetails({ closest: () => null }, {}), null);
});

test("every movie preview is keyboard operable; More and category links remain navigation", () => {
  const html = readFileSync(
    new globalThis.URL("../movies/index.html", import.meta.url),
    "utf8",
  );
  const cards = [...html.matchAll(/<li class="movie-card">[\s\S]*?<\/li>/g)];
  for (const [card] of cards) {
    if (card.includes("movie-more-card"))
      assert.doesNotMatch(card, /data-movie-details/);
    else {
      assert.match(
        card,
        /<button[\s\S]*?type="button"[\s\S]*?data-movie-details/,
      );
      assert.match(card, /aria-label="View details for /);
    }
  }
  assert.equal((html.match(/data-movie-details/g) || []).length, 22);
  for (const path of [
    "movies/index.html",
    "movies/collection.html",
    "books/index.html",
    "series/index.html",
    "stories/index.html",
    "search/index.html",
  ]) {
    const page = readFileSync(
      new globalThis.URL(`../${path}`, import.meta.url),
      "utf8",
    );
    assert.match(page, /src="\.\.\/movies\/movie-details\.mjs" type="module"/);
  }
});
