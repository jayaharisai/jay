import { getCollection } from "./collection-data.mjs";

export function mountCollectionPage(root, env) {
  const doc = root.ownerDocument;
  const key = new env.URLSearchParams(env.location.search).get("list");
  const collection = getCollection(key);
  const grid = root.querySelector("[data-collection-grid]");
  const status = root.querySelector("[data-collection-status]");
  const loadButton = root.querySelector("[data-load-more]");
  const sentinel = root.querySelector("[data-collection-sentinel]");
  const controller = new env.AbortController();
  let observer;
  let frame;
  let entranceFrame;
  let disposed = false;
  // Preserve cards and the scroll position when restored from the back/forward cache.
  let rendered = grid.children.length;
  const allowsMotion =
    env.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches !== true;

  root.querySelector("[data-collection-title]").textContent = collection.title;
  root.querySelector("[data-collection-label]").textContent = collection.label;
  root.querySelector("[data-collection-description]").textContent =
    "40 dummy movies · Sample titles, details and poster artwork.";
  doc.title = `${collection.title} · Jay's Library`;
  doc.querySelector('meta[name="description"]').content =
    `Browse 40 dummy movies in ${collection.title}.`;

  function setStage(value) {
    root.dataset.collectionStage = value;
  }

  function createCard(movie, index, animated) {
    const card = doc.createElement("li");
    card.className = "movie-card";
    if (animated) {
      card.className += ` movie-card-reveal movie-card-stagger-${Math.min(index, 9)}`;
    }
    card.dataset.movieId = movie.id;
    card.dataset.movieStory = movie.story;
    const artwork = doc.createElement("div");
    artwork.className = `movie-card-art movie-card-${movie.poster.key}`;
    const image = doc.createElement("img");
    image.alt = "";
    image.width = movie.poster.width;
    image.height = movie.poster.height;
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    image.src = `./posters/${movie.poster.file}`;
    artwork.append(image);
    const title = doc.createElement("h2");
    title.className = "movie-card-title";
    title.textContent = movie.title;
    const details = doc.createElement("p");
    details.className = "movie-card-details";
    details.textContent = `${movie.year} · ${collection.genre ? movie.language : movie.genre}`;
    card.append(artwork, title, details);
    const trigger = doc.createElement("button");
    trigger.type = "button";
    trigger.className = "movie-card-open";
    trigger.dataset.movieDetails = "";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-label", `View details for ${movie.title}`);
    card.append(trigger);
    return card;
  }

  function updateProgress() {
    const finished = rendered >= collection.movies.length;
    status.textContent = finished
      ? `All ${rendered} movies loaded. You're all caught up.`
      : `${rendered} of ${collection.movies.length} movies`;
    loadButton.hidden = finished;
    loadButton.disabled = finished;
    grid.setAttribute("aria-busy", "false");
    if (finished) observer?.disconnect();
  }

  function appendBatch(size, animated = false) {
    const batch = collection.movies.slice(rendered, rendered + size);
    const fragment = doc.createDocumentFragment();
    batch.forEach((movie, index) =>
      fragment.append(createCard(movie, index, animated)),
    );
    grid.append(fragment);
    rendered += batch.length;
    updateProgress();
  }

  function loadMore() {
    if (disposed || frame !== undefined || rendered >= collection.movies.length)
      return;
    const restoreFocus = doc.activeElement === loadButton;
    grid.setAttribute("aria-busy", "true");
    status.textContent = "Loading more movies…";
    loadButton.disabled = true;
    observer?.unobserve(sentinel);
    frame = env.requestAnimationFrame(() => {
      frame = undefined;
      if (disposed) return;
      appendBatch(10, allowsMotion);
      if (restoreFocus) {
        const target =
          rendered >= collection.movies.length ? status : loadButton;
        if (target === status) status.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
      if (rendered < collection.movies.length) observer?.observe(sentinel);
    });
  }

  loadButton.addEventListener("click", loadMore, { signal: controller.signal });
  if (rendered === 0) {
    setStage(allowsMotion ? "booting" : "ready");
    appendBatch(20, allowsMotion);
    if (allowsMotion) {
      entranceFrame = env.requestAnimationFrame(() => {
        entranceFrame = undefined;
        if (!disposed) setStage("ready");
      });
    }
  } else {
    setStage("ready");
    updateProgress();
  }

  // Keep the explicit button usable without IntersectionObserver or with Data Saver.
  if (
    env.IntersectionObserver &&
    !env.navigator.connection?.saveData &&
    rendered < collection.movies.length
  ) {
    observer = new env.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(sentinel);
  }

  return () => {
    disposed = true;
    controller.abort();
    observer?.disconnect();
    if (frame !== undefined) env.cancelAnimationFrame(frame);
    if (entranceFrame !== undefined) env.cancelAnimationFrame(entranceFrame);
  };
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-collection-page]");
  if (root) {
    let dispose = mountCollectionPage(root, window);
    window.addEventListener("pagehide", () => dispose());
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        dispose();
        dispose = mountCollectionPage(root, window);
      }
    });
  }
}
