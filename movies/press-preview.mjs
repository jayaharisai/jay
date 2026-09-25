// A hold is a preview; scrolling, pinching, and a quick tap keep their normal behavior.
export function createPressController(doc, env, { show, hide }) {
  const controller = new env.AbortController();
  const options = { signal: controller.signal };
  let press;
  let timer;
  let suppressedTrigger;
  let suppressionTimer;

  function clearSuppression() {
    env.clearTimeout(suppressionTimer);
    suppressedTrigger = undefined;
  }

  function cancel() {
    env.clearTimeout(timer);
    if (press?.shown) hide();
    press = undefined;
  }

  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (press) {
        cancel();
        return;
      }
      clearSuppression();
      if (
        !event.isPrimary ||
        event.pointerType !== "touch" ||
        event.button !== 0
      )
        return;
      const trigger = event.target.closest?.("button[data-movie-details]");
      if (
        !trigger?.closest(".movie-card") ||
        trigger.closest('[aria-hidden="true"], [inert]')
      )
        return;
      press = {
        trigger,
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        shown: false,
      };
      timer = env.setTimeout(() => {
        if (!press || !trigger.isConnected) return;
        press.shown = show(trigger) !== false;
        if (press.shown) suppressedTrigger = trigger;
      }, 420);
    },
    { ...options, passive: true },
  );

  doc.addEventListener(
    "pointermove",
    (event) => {
      if (
        press?.id === event.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10
      )
        cancel();
    },
    { ...options, passive: true },
  );

  for (const type of ["pointerup", "pointercancel"]) {
    doc.addEventListener(
      type,
      (event) => {
        if (press?.id === event.pointerId) cancel();
        if (suppressedTrigger) {
          env.clearTimeout(suppressionTimer);
          suppressionTimer = env.setTimeout(clearSuppression, 800);
        }
      },
      options,
    );
  }

  // Mobile browsers can emit a click after a long press. Do not open the drawer.
  doc.addEventListener(
    "click",
    (event) => {
      if (
        suppressedTrigger &&
        event.detail !== 0 &&
        event.target.closest?.("button[data-movie-details]") ===
          suppressedTrigger
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        clearSuppression();
      }
    },
    { ...options, capture: true },
  );
  doc.addEventListener(
    "contextmenu",
    (event) => {
      // Suppress only the touched movie's native long-press menu.
      if (
        press &&
        event.target.closest?.("button[data-movie-details]") === press.trigger
      )
        event.preventDefault();
    },
    options,
  );
  doc.addEventListener("scroll", cancel, {
    ...options,
    capture: true,
    passive: true,
  });
  doc.addEventListener("visibilitychange", cancel, options);
  doc.addEventListener("movie-page-change", cancel, options);
  doc.addEventListener("movie-details-open", cancel, options);
  env.addEventListener("blur", cancel, options);
  env.addEventListener("resize", cancel, options);
  env.visualViewport?.addEventListener("resize", cancel, options);
  return () => {
    cancel();
    clearSuppression();
    controller.abort();
  };
}

export function mountPressPreview(doc, env) {
  const overlay = doc.createElement("div");
  overlay.className = "movie-press-preview";
  overlay.setAttribute("aria-hidden", "true");
  const card = doc.createElement("div");
  card.className = "movie-press-card";
  const image = doc.createElement("img");
  image.alt = "";
  const title = doc.createElement("p");
  card.append(image, title);
  overlay.append(card);
  doc.body.append(overlay);

  const dispose = createPressController(doc, env, {
    show(trigger) {
      const source = trigger.closest(".movie-card");
      const poster = source.querySelector("img");
      if (!poster || !poster.complete || !poster.naturalWidth) return false;
      const rect = poster.getBoundingClientRect();
      const viewport = env.visualViewport;
      const viewWidth = viewport?.width ?? env.innerWidth;
      const viewHeight = viewport?.height ?? env.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const width = Math.min(
        rect.width * 1.25,
        260,
        viewWidth - 40,
        (viewHeight - 100) / 1.5,
      );
      if (width <= 0) return false;
      const height = width * 1.5 + 52;
      card.style.width = `${width}px`;
      card.style.left = `${Math.max(offsetLeft + 20, Math.min(rect.left - (width - rect.width) / 2, offsetLeft + viewWidth - width - 20))}px`;
      card.style.top = `${Math.max(offsetTop + 20, Math.min(rect.top - (height - rect.height) / 2, offsetTop + viewHeight - height - 20))}px`;
      image.src = poster.currentSrc || poster.src;
      image.style.objectPosition = env.getComputedStyle(poster).objectPosition;
      title.textContent = source.querySelector(".movie-card-title").textContent;
      overlay.classList.add("is-visible");
      return true;
    },
    hide() {
      overlay.classList.remove("is-visible");
    },
  });
  return () => {
    dispose();
    overlay.remove();
  };
}
