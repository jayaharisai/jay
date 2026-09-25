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
let pendingRequest;
let navigationVersion = 0;

function readPage(source) {
  const main = source.querySelector(".app-canvas");
  if (!main) throw new Error("Page content is missing.");

  return {
    main: main.cloneNode(true),
    route: source.body.dataset.route,
    title: source.title,
    description:
      source.querySelector('meta[name="description"]')?.content ?? "",
  };
}

function selectTab(route) {
  navigation.style.setProperty(
    "--active-index",
    tabs.findIndex((tab) => tab.route === route),
  );

  links.forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

pages.set(document.body.dataset.route, readPage(document));
selectTab(document.body.dataset.route);

async function navigate(link, updateHistory = true) {
  pendingRequest?.abort();
  const controller = new window.AbortController();
  pendingRequest = controller;
  const version = ++navigationVersion;
  const route = link.dataset.route;
  document.querySelector(".app-canvas").setAttribute("aria-busy", "true");

  try {
    let page = pages.get(route);

    if (!page) {
      const response = await window.fetch(link.href, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unable to load the page.");
      const html = await response.text();
      const source = new window.DOMParser().parseFromString(html, "text/html");
      page = readPage(source);
      if (page.route !== route) throw new Error("Unexpected page.");
      pages.set(route, page);
    }

    // A slower response must never replace a newer tab selection.
    if (version !== navigationVersion) return;

    if (updateHistory && document.body.dataset.route !== route) {
      window.history.pushState(null, "", link.href);
    }

    document
      .querySelector(".app-canvas")
      .replaceWith(page.main.cloneNode(true));
    document.body.dataset.route = route;
    document.title = page.title;
    document.querySelector('meta[name="description"]').content =
      page.description;
    selectTab(route);
    window.scrollTo(0, 0);

    const heading = document.querySelector(".app-canvas h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  } catch (error) {
    if (error.name === "AbortError" || version !== navigationVersion) return;
    // Keep the real page links usable if enhanced navigation fails.
    if (updateHistory) window.location.assign(link.href);
    else window.location.replace(link.href);
  } finally {
    if (version === navigationVersion) {
      document.querySelector(".app-canvas").removeAttribute("aria-busy");
      pendingRequest = undefined;
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

window.addEventListener("pagehide", () => {
  pendingRequest?.abort();
});
