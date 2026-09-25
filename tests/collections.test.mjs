import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { collections, getCollection } from "../movies/collection-data.mjs";
import { mountCollectionPage } from "../movies/collection.mjs";

class Element extends globalThis.EventTarget {
  constructor(tag, doc) {
    super();
    this.tagName = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {};
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tagName === "fragment") this.children.push(...node.children);
      else this.children.push(node);
    }
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  set disabled(value) {
    this.isDisabled = value;
    if (value && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }
  get disabled() {
    return this.isDisabled;
  }
}

function createEnvironment({
  key = "favourites",
  observer = true,
  saveData = false,
} = {}) {
  const meta = {};
  const doc = {
    activeElement: null,
    createElement(tag) {
      return new Element(tag, doc);
    },
    createDocumentFragment() {
      return new Element("fragment", doc);
    },
    querySelector() {
      return meta;
    },
  };
  const names = ["grid", "status", "sentinel", "title", "label", "description"];
  const elements = Object.fromEntries(
    names.map((name) => [`[data-collection-${name}]`, new Element("div", doc)]),
  );
  const button = new Element("button", doc);
  elements["[data-load-more]"] = button;
  const root = {
    ownerDocument: doc,
    dataset: {},
    attributes: {},
    querySelector: (selector) => elements[selector],
  };
  const frames = new Map();
  const observers = [];
  let frameId = 0;
  const env = {
    URLSearchParams: globalThis.URLSearchParams,
    AbortController: globalThis.AbortController,
    location: { search: `?list=${key}` },
    navigator: { connection: { saveData } },
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    IntersectionObserver: observer
      ? class {
          constructor(callback, options) {
            this.callback = callback;
            this.options = options;
            observers.push(this);
          }
          observe() {
            this.connected = true;
          }
          unobserve() {
            this.connected = false;
          }
          disconnect() {
            this.connected = false;
          }
          notify(isIntersecting = true) {
            this.callback([{ isIntersecting }]);
          }
        }
      : undefined,
  };
  return {
    env,
    root,
    doc,
    button,
    frames,
    observers,
    grid: elements["[data-collection-grid]"],
    status: elements["[data-collection-status]"],
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    click() {
      button.dispatchEvent(new globalThis.Event("click"));
    },
  };
}

test("all thirteen collections have forty unique, deterministic dummy cards and valid posters", () => {
  assert.equal(Object.keys(collections).length, 13);
  for (const key of Object.keys(collections)) {
    const collection = getCollection(key);
    assert.equal(collection.movies.length, 40);
    assert.equal(new Set(collection.movies.map((movie) => movie.id)).size, 40);
    assert.equal(
      new Set(collection.movies.map((movie) => movie.title)).size,
      40,
    );
    assert.deepEqual(collection, getCollection(key));
    for (const movie of collection.movies) {
      assert.ok(
        existsSync(
          new globalThis.URL(
            `../movies/posters/${movie.poster.file}`,
            import.meta.url,
          ),
        ),
      );
      if (collection.language)
        assert.equal(movie.language, collection.language);
      if (collection.genre) assert.equal(movie.genre, collection.genre);
    }
  }
});

test("missing and invalid collection names safely fall back to All movies", () => {
  for (const key of [
    null,
    "",
    "unknown",
    "__proto__",
    "constructor",
    "<script>",
  ]) {
    assert.equal(getCollection(key).key, "all");
  }
});

test("every collection starts with twenty lazy-loading cards", () => {
  for (const key of Object.keys(collections)) {
    const context = createEnvironment({ key });
    const dispose = mountCollectionPage(context.root, context.env);
    assert.equal(context.root.dataset.collectionStage, "booting");
    assert.equal(context.grid.children.length, 20);
    assert.equal(context.status.textContent, "20 of 40 movies");
    assert.equal(
      context.doc.title,
      `${collections[key].title} · Jay's Library`,
    );
    assert.equal(context.observers[0].options.rootMargin, "320px 0px");
    for (const card of context.grid.children) {
      const image = card.children[0].children[0];
      assert.equal(image.loading, "lazy");
      assert.equal(image.decoding, "async");
      assert.ok(image.width > 0 && image.height > 0);
      const trigger = card.children.at(-1);
      assert.equal(trigger.tagName, "button");
      assert.equal(trigger.type, "button");
      assert.equal(trigger.attributes["aria-haspopup"], "dialog");
      assert.ok(card.dataset.movieStory.length > 200);
      assert.match(card.className, /movie-card-reveal/);
    }
    context.flush();
    assert.equal(context.root.dataset.collectionStage, "ready");
    dispose();
  }
});

test("near-end loading adds ten, deduplicates triggers and stops at forty", () => {
  const context = createEnvironment();
  const dispose = mountCollectionPage(context.root, context.env);
  context.flush();
  const observer = context.observers[0];
  observer.notify(false);
  assert.equal(context.frames.size, 0);
  observer.notify();
  observer.notify();
  context.click();
  assert.equal(context.frames.size, 1);
  assert.equal(context.grid.attributes["aria-busy"], "true");
  context.flush();
  assert.equal(context.grid.children.length, 30);
  assert.equal(context.grid.attributes["aria-busy"], "false");
  assert.equal(context.button.disabled, false);
  observer.notify();
  context.flush();
  assert.equal(context.grid.children.length, 40);
  assert.equal(
    new Set(context.grid.children.map((card) => card.dataset.movieId)).size,
    40,
  );
  assert.match(context.status.textContent, /All 40 movies loaded/);
  assert.equal(context.button.hidden, true);
  assert.equal(observer.connected, false);
  observer.notify();
  context.click();
  assert.equal(context.frames.size, 0);
  dispose();
});

test("manual fallback works without an observer and with Data Saver enabled", () => {
  for (const options of [{ observer: false }, { saveData: true }]) {
    const context = createEnvironment(options);
    const dispose = mountCollectionPage(context.root, context.env);
    context.flush();
    assert.equal(context.observers.length, 0);
    assert.equal(context.button.hidden, false);
    context.button.focus();
    context.click();
    context.flush();
    assert.equal(context.grid.children.length, 30);
    assert.equal(context.doc.activeElement, context.button);
    context.button.focus();
    context.click();
    context.flush();
    assert.equal(context.grid.children.length, 40);
    assert.equal(context.doc.activeElement, context.status);
    dispose();
  }
});

test("leaving cancels work and back/forward restoration preserves loaded cards", () => {
  const context = createEnvironment();
  let dispose = mountCollectionPage(context.root, context.env);
  context.flush();
  context.click();
  context.flush();
  assert.equal(context.grid.children.length, 30);
  context.click();
  dispose();
  assert.equal(context.frames.size, 0);
  context.click();
  context.observers[0].notify();
  assert.equal(context.frames.size, 0);
  assert.equal(context.grid.children.length, 30);
  dispose = mountCollectionPage(context.root, context.env);
  assert.equal(context.root.dataset.collectionStage, "ready");
  assert.equal(context.grid.children.length, 30);
  assert.equal(context.grid.attributes["aria-busy"], "false");
  context.click();
  context.flush();
  assert.equal(context.grid.children.length, 40);
  dispose();
  dispose = mountCollectionPage(context.root, context.env);
  assert.equal(context.root.dataset.collectionStage, "ready");
  assert.equal(context.grid.children.length, 40);
  assert.equal(context.button.hidden, true);
  dispose();
});

test("preview rows end with More and all category links work under GitHub Pages subpaths", () => {
  const html = readFileSync(
    new globalThis.URL("../movies/index.html", import.meta.url),
    "utf8",
  );
  const rows = [...html.matchAll(/<ul\s+class="movie-row"[\s\S]*?<\/ul>/g)];
  assert.equal(rows.length, 6);
  for (const [row] of rows) {
    assert.equal((row.match(/class="movie-more-card"/g) || []).length, 1);
    assert.ok(
      row.lastIndexOf('class="movie-more-card"') > row.lastIndexOf("<img"),
    );
  }
  const keys = new Set();
  for (const [, href, key] of html.matchAll(
    /href="(\.\.\/movies\/collection\.html\?list=([a-z]+))"/g,
  )) {
    assert.ok(Object.hasOwn(collections, key));
    keys.add(key);
    for (const base of [
      "https://example.com/movies/",
      "https://example.com/jay/movies/",
    ]) {
      const url = new globalThis.URL(href, base);
      assert.equal(
        url.pathname,
        new globalThis.URL("collection.html", base).pathname,
      );
    }
  }
  assert.equal(keys.size, 13);
  assert.doesNotMatch(html, /<dialog|data-open-favourites/);
});

test("collection tabs use native navigation while landing tabs retain enhanced navigation", () => {
  const source = readFileSync(
    new globalThis.URL("../script.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf('navigation.addEventListener("click"'),
    source.indexOf('window.addEventListener("popstate"'),
  );
  for (const isCollectionPage of [true, false]) {
    let callback;
    let prevented = false;
    let navigated = false;
    runInNewContext(handler, {
      isCollectionPage,
      navigation: {
        addEventListener(name, listener) {
          callback = listener;
        },
      },
      navigate() {
        navigated = true;
      },
    });
    callback({
      target: { closest: () => ({}) },
      button: 0,
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, !isCollectionPage);
    assert.equal(navigated, !isCollectionPage);
  }
});

test("native Back on collection pages does not reload a restored document", () => {
  const source = readFileSync(
    new globalThis.URL("../script.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf('window.addEventListener("popstate"'),
    source.indexOf("function prefetch("),
  );
  let callback;
  runInNewContext(handler, {
    isCollectionPage: true,
    window: {
      addEventListener(name, listener) {
        callback = listener;
      },
    },
  });
  assert.doesNotThrow(() => callback());
});

test("initial page loads animate the main page while collection documents keep their own staging", () => {
  const source = readFileSync(
    new globalThis.URL("../script.js", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new globalThis.URL("../style.css", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /mountInitialPageReveal\(document\.querySelector\("\.page-content"\)\)/,
  );
  assert.match(
    source,
    /if \(!content \|\| isCollectionPage \|\| reducedMotion\.matches\) return;/,
  );
  assert.match(source, /content\.dataset\.pageStage = "booting"/);
  assert.match(source, /content\.dataset\.pageStage = "ready"/);
  assert.match(css, /\.page-content\[data-page-stage="booting"\] > \*/);
  assert.match(css, /@keyframes page-content-in/);
});

test("about route is included in navigation, quality checks and deployment", () => {
  const source = readFileSync(
    new globalThis.URL("../script.js", import.meta.url),
    "utf8",
  );
  const packageJson = readFileSync(
    new globalThis.URL("../package.json", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new globalThis.URL(
      "../.github/workflows/deploy-pages.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const aboutHtml = readFileSync(
    new globalThis.URL("../about/index.html", import.meta.url),
    "utf8",
  );
  assert.match(source, /route: "about"/);
  assert.match(source, /label: "About Me"/);
  assert.match(source, /<svg viewBox="0 0 24 24"/);
  assert.match(source, /--nav-count/);
  assert.match(packageJson, /about\/index\.html/);
  assert.match(
    workflow,
    /cp -R movies books series stories search about _site\//,
  );
  assert.match(aboutHtml, /<body data-route="about">/);
  assert.match(
    aboutHtml,
    /<h1 class="page-title" id="about-title">About Me<\/h1>/,
  );
});

test("collection assets resolve inside the existing Pages deployment directories", () => {
  const pageUrl = new globalThis.URL(
    "../movies/collection.html",
    import.meta.url,
  );
  const html = readFileSync(pageUrl, "utf8");
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (target.startsWith("https:")) continue;
    assert.ok(existsSync(new globalThis.URL(target, pageUrl)), target);
  }
  const source = readFileSync(
    new globalThis.URL("../movies/collection.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.indexOf('image.loading = "lazy"') < source.indexOf("image.src ="),
  );
  for (const path of [
    "../script.js",
    "../style.css",
    "../movies/index.html",
    "../about/index.html",
  ]) {
    assert.doesNotMatch(
      readFileSync(new globalThis.URL(path, import.meta.url), "utf8"),
      /showModal|movie-collection-dialog|data-open-favourites/,
    );
  }
});
