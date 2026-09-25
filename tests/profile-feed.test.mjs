import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(
  new globalThis.URL("../script.js", import.meta.url),
  "utf8",
);
const mountSource = source.slice(
  source.indexOf("function mountProfileFeed("),
  source.indexOf("function mountInitialPageReveal("),
);

function setup(reduced = false) {
  const button = new globalThis.EventTarget();
  const status = {};
  const posts = Array.from({ length: 6 }, () => {
    const classes = new Set();
    const heading = {
      focus() {
        heading.focused = true;
      },
    };
    return {
      heading,
      classes,
      classList: { add: (name) => classes.add(name) },
      querySelector: () => heading,
    };
  });
  const feed = {
    dataset: {},
    querySelectorAll: () => posts,
    querySelector: (selector) =>
      selector === "[data-profile-load-more]" ? button : status,
  };
  const mount = runInNewContext(`(${mountSource})`, {
    window: { AbortController: globalThis.AbortController },
    reducedMotion: { matches: reduced },
  });
  return {
    posts,
    button,
    status,
    mount: () => mount({ querySelector: () => feed }),
    click: () => button.dispatchEvent(new globalThis.Event("click")),
  };
}

test("profile feed reveals two posts at a time and focuses the new content", () => {
  const context = setup();
  const dispose = context.mount();
  const visible = () => context.posts.filter((post) => !post.hidden).length;
  assert.equal(visible(), 2);
  assert.equal(context.status.textContent, "2 of 6 posts");
  context.click();
  assert.equal(visible(), 4);
  assert.equal(context.posts[2].heading.focused, true);
  assert.ok(context.posts[2].classes.has("profile-post-reveal"));
  assert.equal(context.button.hidden, false);
  context.click();
  assert.equal(visible(), 6);
  assert.equal(context.button.hidden, true);
  assert.equal(context.status.textContent, "You're all caught up.");
  dispose();
});

test("profile feed restores its loaded count without duplicate listeners", () => {
  const context = setup();
  let dispose = context.mount();
  context.click();
  dispose();
  context.click();
  assert.equal(context.posts.filter((post) => !post.hidden).length, 4);
  dispose = context.mount();
  assert.equal(context.posts.filter((post) => !post.hidden).length, 4);
  context.click();
  assert.equal(context.posts.filter((post) => !post.hidden).length, 6);
  dispose();
});

test("reduced motion reveals profile posts without entrance animation", () => {
  const context = setup(true);
  const dispose = context.mount();
  context.click();
  assert.equal(context.posts[2].hidden, false);
  assert.equal(context.posts[2].classes.size, 0);
  dispose();
});

test("profile artwork and local links resolve under the deployed About route", () => {
  const page = new globalThis.URL("../about/index.html", import.meta.url);
  const html = readFileSync(page, "utf8");
  for (const [, target] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (target.startsWith("https:")) continue;
    assert.ok(existsSync(new globalThis.URL(target, page)), target);
  }
});
