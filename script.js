const tabs = [
  {
    route: "movies",
    label: "Movies",
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  },
  {
    route: "books",
    label: "Books",
    icon: '<path d="M12 20c-2-1.4-4.5-2-8-2V4c3.5 0 6 .6 8 2 2-1.4 4.5-2 8-2v14c-3.5 0-6 .6-8 2Z"/><path d="M12 6v14"/>',
  },
  {
    route: "series",
    label: "Series",
    icon: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9 5 3-5 3V9Z"/>',
  },
  {
    route: "stories",
    label: "Stories",
    icon: '<path d="M4 20h16M5 16.5 16.8 4.7a2 2 0 0 1 2.8 2.8L7.8 19.3 4 20l.7-3.8Z"/><path d="m14.8 6.7 2.8 2.8"/>',
  },
  {
    route: "search",
    label: "Search",
    icon: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.2 4.2"/>',
  },
];

const navigation = document.querySelector(".bottom-nav");

navigation.innerHTML = `<span class="nav-track" aria-hidden="true"><span class="nav-highlight"></span></span>${tabs
  .map(({ route, label, icon }) => {
    return `<a class="nav-item" data-route="${route}" href="../${route}/">
      <span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
      <span class="nav-label">${label}</span>
    </a>`;
  })
  .join("")}`;

const links = [...navigation.querySelectorAll("a.nav-item")];
const pages = new Map();
const requests = new Map();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let navigationVersion = 0;
let enteringAnimation;
let leavingAnimation;
let leavingContent;
let disposePageFeatures = () => {};

function readPage(source) {
  const content = source.querySelector(".page-content");
  if (!content) throw new Error("Page content is missing.");

  return {
    content: content.cloneNode(true),
    route: source.body.dataset.route,
    title: source.title,
    description:
      source.querySelector('meta[name="description"]')?.content ?? "",
  };
}

function selectTab(route, committed = true) {
  navigation.style.setProperty(
    "--active-index",
    tabs.findIndex((tab) => tab.route === route),
  );

  links.forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle("is-active", active);
    if (committed) {
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  });
}

pages.set(document.body.dataset.route, readPage(document));
selectTab(document.body.dataset.route);
disposePageFeatures = mountMovieHero(document.querySelector(".page-content"));

function loadPage(link) {
  const route = link.dataset.route;
  if (pages.has(route)) return Promise.resolve(pages.get(route));
  if (requests.has(route)) return requests.get(route).promise;

  const controller = new window.AbortController();
  const promise = (async () => {
    const response = await window.fetch(link.href, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Unable to load the page.");
    const html = await response.text();
    const source = new window.DOMParser().parseFromString(html, "text/html");
    const page = readPage(source);
    if (page.route !== route) throw new Error("Unexpected page.");
    pages.set(route, page);
    return page;
  })().finally(() => {
    if (requests.get(route)?.controller === controller) requests.delete(route);
  });

  requests.set(route, { promise, controller });
  return promise;
}

function stopContentMotion() {
  enteringAnimation?.cancel();
  leavingAnimation?.cancel();
  leavingContent?.remove();
  enteringAnimation = undefined;
  leavingAnimation = undefined;
  leavingContent = undefined;
}

function showContent(page, direction) {
  const main = document.querySelector(".app-canvas");
  const current = main.querySelector(".page-content:not([aria-hidden])");
  const next = page.content.cloneNode(true);
  const animate = !reducedMotion.matches && typeof next.animate === "function";
  // Preserve the current visual position if another tap interrupts a transition.
  const currentStyle = animate ? window.getComputedStyle(current) : null;
  const start = currentStyle
    ? { opacity: currentStyle.opacity, transform: currentStyle.transform }
    : null;
  disposePageFeatures();
  stopContentMotion();

  if (!animate) {
    main.replaceChildren(next);
    disposePageFeatures = mountMovieHero(next);
    return;
  }

  current.setAttribute("aria-hidden", "true");
  current.inert = true;
  leavingContent = current;
  main.append(next);
  disposePageFeatures = mountMovieHero(next);

  leavingAnimation = current.animate(
    [
      start,
      { opacity: 0, transform: `translate3d(${-6 * direction}px, 0, 0)` },
    ],
    { duration: 140, easing: "ease-out", fill: "forwards" },
  );
  leavingAnimation.finished
    .then(() => {
      current.remove();
      if (leavingContent === current) leavingContent = undefined;
    })
    .catch(() => {});

  enteringAnimation = next.animate(
    [
      { opacity: 0, transform: `translate3d(${8 * direction}px, 0, 0)` },
      { opacity: 1, transform: "translate3d(0, 0, 0)" },
    ],
    { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  );
  enteringAnimation.finished.catch(() => {});
}

async function navigate(link, updateHistory = true) {
  const version = ++navigationVersion;
  const route = link.dataset.route;
  const currentRoute = document.body.dataset.route;

  // Move the indicator immediately, even on the first visit over a slow connection.
  selectTab(route, false);
  if (route === currentRoute) {
    selectTab(route);
    document.querySelector(".app-canvas").removeAttribute("aria-busy");
    return;
  }

  document.querySelector(".app-canvas").setAttribute("aria-busy", "true");

  try {
    const page = await loadPage(link);

    // A slower response must never replace a newer tab selection.
    if (version !== navigationVersion) return;

    if (updateHistory && document.body.dataset.route !== route) {
      window.history.pushState(null, "", link.href);
    }

    const direction = Math.sign(
      tabs.findIndex((tab) => tab.route === route) -
        tabs.findIndex((tab) => tab.route === currentRoute),
    );
    showContent(page, direction);
    document.body.dataset.route = route;
    document.title = page.title;
    document.querySelector('meta[name="description"]').content =
      page.description;
    selectTab(route);
    window.scrollTo(0, 0);

    const heading = document.querySelector(
      ".page-content:not([aria-hidden]) h1",
    );
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  } catch (error) {
    if (error.name === "AbortError" || version !== navigationVersion) return;
    selectTab(document.body.dataset.route);
    // Keep the real page links usable if enhanced navigation fails.
    if (updateHistory) window.location.assign(link.href);
    else window.location.replace(link.href);
  } finally {
    if (version === navigationVersion) {
      document.querySelector(".app-canvas").removeAttribute("aria-busy");
    }
  }
}

navigation.addEventListener("click", (event) => {
  const link = event.target.closest("a.nav-item");

  if (
    !link ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  navigate(link);
});

window.addEventListener("popstate", () => {
  const path = window.location.pathname.replace(/index\.html$/, "");
  const link = links.find(
    (item) => new window.URL(item.href).pathname === path,
  );
  if (link) navigate(link, false);
  else window.location.reload();
});

function prefetch(link) {
  const connection = window.navigator.connection;
  if (
    !link ||
    connection?.saveData ||
    ["slow-2g", "2g"].includes(connection?.effectiveType)
  )
    return;

  loadPage(link).catch(() => {});
}

// Share preloads with navigation so touching a tab never starts duplicate requests.
["pointerover", "focusin"].forEach((eventName) => {
  navigation.addEventListener(eventName, (event) => {
    prefetch(event.target.closest("a.nav-item"));
  });
});

function warmPages() {
  if (!document.hidden) links.forEach(prefetch);
}

const idlePreload = window.requestIdleCallback
  ? window.requestIdleCallback(warmPages, { timeout: 2000 })
  : window.setTimeout(warmPages, 800);

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) stopContentMotion();
});

window.addEventListener("pagehide", () => {
  navigationVersion += 1;
  if (window.cancelIdleCallback) window.cancelIdleCallback(idlePreload);
  else window.clearTimeout(idlePreload);
  requests.forEach(({ controller }) => controller.abort());
  requests.clear();
  disposePageFeatures();
  stopContentMotion();
  selectTab(document.body.dataset.route);
  document.querySelector(".app-canvas").removeAttribute("aria-busy");
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    disposePageFeatures();
    disposePageFeatures = mountMovieHero(
      document.querySelector(".page-content:not([aria-hidden])"),
    );
  }
});

function mountMovieHero(content) {
  const hero = content?.querySelector(".movie-hero");
  if (!hero) return () => {};

  const viewport = hero.querySelector(".movie-hero-viewport");
  const slides = [...hero.querySelectorAll(".movie-slide")];
  const status = hero.querySelector("[data-slide-status]");
  const controller = new window.AbortController();
  const listenerOptions = { signal: controller.signal };
  let index = 0;
  let rotationEnabled = !reducedMotion.matches;
  let hovered = false;
  let inView = true;
  let rotationTimer;
  let settleTimer;
  let scrollFrame;
  let announceOnSettle = false;

  function updateSlides() {
    slides.forEach((slide, position) => {
      slide.setAttribute("aria-hidden", String(position !== index));
    });
  }

  function scheduleRotation() {
    window.clearTimeout(rotationTimer);
    if (rotationEnabled && !hovered && inView && !document.hidden) {
      rotationTimer = window.setTimeout(
        () => goToSlide(index + 1, false),
        6500,
      );
    }
  }

  function stopRotation() {
    rotationEnabled = false;
    window.clearTimeout(rotationTimer);
  }

  function goToSlide(nextIndex, manual = true) {
    if (manual) stopRotation();
    window.clearTimeout(rotationTimer);
    announceOnSettle = manual;
    const next = (nextIndex + slides.length) % slides.length;
    viewport.scrollTo({
      left: next * viewport.clientWidth,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
    if (next === index) scheduleRotation();
  }

  viewport.addEventListener(
    "scroll",
    () => {
      window.clearTimeout(rotationTimer);
      window.clearTimeout(settleTimer);
      if (!scrollFrame) {
        scrollFrame = window.requestAnimationFrame(() => {
          scrollFrame = undefined;
          index = Math.max(
            0,
            Math.min(
              slides.length - 1,
              Math.round(viewport.scrollLeft / viewport.clientWidth),
            ),
          );
          updateSlides();
        });
      }
      settleTimer = window.setTimeout(() => {
        if (announceOnSettle) {
          status.textContent = `${slides[index].querySelector("h2").textContent}, slide ${index + 1} of ${slides.length}.`;
          announceOnSettle = false;
        }
        scheduleRotation();
      }, 160);
    },
    { ...listenerOptions, passive: true },
  );

  viewport.addEventListener(
    "pointerdown",
    () => {
      stopRotation();
      announceOnSettle = true;
    },
    { ...listenerOptions, passive: true },
  );

  viewport.addEventListener(
    "keydown",
    (event) => {
      const targets = {
        ArrowLeft: index - 1,
        ArrowRight: index + 1,
        Home: 0,
        End: slides.length - 1,
      };
      if (!(event.key in targets)) return;
      event.preventDefault();
      goToSlide(targets[event.key]);
    },
    listenerOptions,
  );

  hero.addEventListener("focusin", stopRotation, listenerOptions);
  hero.addEventListener(
    "pointerenter",
    (event) => {
      if (event.pointerType !== "mouse") return;
      hovered = true;
      scheduleRotation();
    },
    listenerOptions,
  );
  hero.addEventListener(
    "pointerleave",
    () => {
      hovered = false;
      scheduleRotation();
    },
    listenerOptions,
  );
  document.addEventListener(
    "visibilitychange",
    scheduleRotation,
    listenerOptions,
  );
  reducedMotion.addEventListener(
    "change",
    () => {
      if (reducedMotion.matches) stopRotation();
    },
    listenerOptions,
  );

  const resizeObserver = new window.ResizeObserver(() => {
    viewport.scrollTo({ left: index * viewport.clientWidth, behavior: "auto" });
  });
  resizeObserver.observe(viewport);

  const visibilityObserver = new window.IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      scheduleRotation();
    },
    { threshold: 0.25 },
  );
  visibilityObserver.observe(hero);

  updateSlides();
  scheduleRotation();
  return () => {
    controller.abort();
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    window.clearTimeout(rotationTimer);
    window.clearTimeout(settleTimer);
    window.cancelAnimationFrame(scrollFrame);
  };
}
