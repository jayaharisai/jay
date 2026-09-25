import { getMovieStory } from "./collection-data.mjs";

// Native dialog supplies modal focus containment and makes the page behind it inert.
export function createDrawerController(parts, env) {
  const {
    dialog,
    panel,
    scrim,
    handle,
    closeButton,
    image,
    title,
    story,
    content,
  } = parts;
  const doc = dialog.ownerDocument;
  const controller = new env.AbortController();
  const options = { signal: controller.signal };
  const motion = env.matchMedia("(prefers-reduced-motion: reduce)");
  let phase = "closed";
  let version = 0;
  let animations = [];
  let opener;
  let restoreScroll;
  let gesture;
  let dragFrame;
  let outsidePress = false;
  let destroyed = false;

  function stopMotion() {
    animations.forEach((animation) => animation.cancel());
    animations = [];
  }

  function lockScroll() {
    if (restoreScroll) return;
    const { scrollX, scrollY } = env;
    const rootStyle = doc.documentElement.style;
    const bodyStyle = doc.body.style;
    const saved = {
      rootOverflow: rootStyle.overflow,
      rootOverscroll: rootStyle.overscrollBehavior,
      bodyOverflow: bodyStyle.overflow,
    };
    // Do not fix/reposition the body: that resets the viewport on mobile and
    // moves fixed navigation. The root's stable scrollbar gutter keeps its width.
    rootStyle.overflow = "hidden";
    rootStyle.overscrollBehavior = "none";
    bodyStyle.overflow = "hidden";
    restoreScroll = () => {
      rootStyle.overflow = saved.rootOverflow;
      rootStyle.overscrollBehavior = saved.rootOverscroll;
      bodyStyle.overflow = saved.bodyOverflow;
      // Avoid an unnecessary scroll call (and browser-toolbar movement).
      if (env.scrollX !== scrollX || env.scrollY !== scrollY) {
        env.scrollTo(scrollX, scrollY);
      }
      restoreScroll = undefined;
    };
  }

  function animateTo(
    transform,
    opacity,
    duration,
    easing = "cubic-bezier(0.22, 0.61, 0.36, 1)",
    start,
  ) {
    const fromTransform =
      start?.transform ?? env.getComputedStyle(panel).transform;
    const fromOpacity = start?.opacity ?? env.getComputedStyle(scrim).opacity;
    stopMotion();
    panel.style.transform = transform;
    scrim.style.opacity = String(opacity);
    if (motion.matches || typeof panel.animate !== "function")
      return Promise.resolve();
    animations = [
      panel.animate([{ transform: fromTransform }, { transform }], {
        duration,
        easing,
        fill: "both",
      }),
      scrim.animate([{ opacity: fromOpacity }, { opacity }], {
        duration,
        easing: "ease-out",
        fill: "both",
      }),
    ];
    return Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    );
  }

  function stopGesture() {
    if (dragFrame !== undefined) env.cancelAnimationFrame(dragFrame);
    dragFrame = undefined;
    const captured = gesture;
    gesture = undefined;
    if (captured && handle.hasPointerCapture(captured.id))
      handle.releasePointerCapture(captured.id);
  }

  function finishClose(restoreFocus = true) {
    ++version;
    phase = "closed";
    stopGesture();
    stopMotion();
    if (dialog.open) dialog.close();
    restoreScroll?.();
    if (
      restoreFocus &&
      opener?.isConnected &&
      !opener.closest('[aria-hidden="true"], [inert]')
    ) {
      opener.focus({ preventScroll: true });
    }
    opener = undefined;
  }

  function close({ immediate = false, restoreFocus = true } = {}) {
    if (phase === "closed") return;
    if (immediate || motion.matches) {
      finishClose(restoreFocus);
      return;
    }
    if (phase === "closing") return;
    phase = "closing";
    stopGesture();
    const current = ++version;
    animateTo(
      "translate3d(0, 100%, 0)",
      0,
      340,
      "cubic-bezier(0.4, 0, 0.2, 1)",
    ).then(() => {
      if (version === current && !destroyed) finishClose(restoreFocus);
    });
  }

  function open(movie, trigger) {
    if (destroyed) return;
    const wasClosed = !dialog.open;
    const current = ++version;
    opener = trigger;
    stopGesture();
    image.src = movie.image;
    image.width = movie.width;
    image.height = movie.height;
    image.style.objectPosition = movie.position || "50% 50%";
    title.textContent = movie.title;
    story.textContent = movie.story || getMovieStory(movie.title);
    content.scrollTop = 0;
    phase = "opening";
    if (wasClosed) {
      // Let native dialog focus see the resting layout, not a control below the
      // viewport. The animation supplies the offscreen first frame afterwards.
      panel.style.transform = "translate3d(0, 0, 0)";
      scrim.style.opacity = "0";
      lockScroll();
      dialog.showModal();
    }
    closeButton.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    doc.dispatchEvent(new env.Event("movie-details-open"));
    animateTo(
      "translate3d(0, 0, 0)",
      1,
      460,
      undefined,
      wasClosed
        ? { transform: "translate3d(0, 100%, 0)", opacity: "0" }
        : undefined,
    ).then(() => {
      if (version === current && !destroyed) phase = "open";
    });
  }

  closeButton.addEventListener("click", () => close(), options);
  dialog.addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      close();
    },
    options,
  );
  dialog.addEventListener(
    "close",
    () => {
      if (!dialog.open && phase !== "closed") finishClose();
    },
    options,
  );
  dialog.addEventListener(
    "pointerdown",
    (event) => {
      outsidePress = event.target === scrim || event.target === dialog;
    },
    options,
  );
  dialog.addEventListener(
    "click",
    (event) => {
      if (outsidePress && (event.target === scrim || event.target === dialog))
        close();
      outsidePress = false;
    },
    options,
  );
  handle.addEventListener(
    "pointerdown",
    (event) => {
      if (phase !== "open" || !event.isPrimary || event.button !== 0) return;
      stopMotion();
      gesture = {
        id: event.pointerId,
        start: event.clientY,
        last: event.clientY,
        time: event.timeStamp,
        delta: 0,
        velocity: 0,
        height: panel.getBoundingClientRect().height,
      };
      handle.setPointerCapture(event.pointerId);
    },
    options,
  );
  handle.addEventListener(
    "pointermove",
    (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      gesture.velocity =
        (event.clientY - gesture.last) /
        Math.max(1, event.timeStamp - gesture.time);
      gesture.last = event.clientY;
      gesture.time = event.timeStamp;
      gesture.delta = Math.max(0, event.clientY - gesture.start);
      if (dragFrame !== undefined) return;
      dragFrame = env.requestAnimationFrame(() => {
        dragFrame = undefined;
        if (!gesture) return;
        panel.style.transform = `translate3d(0, ${gesture.delta}px, 0)`;
        scrim.style.opacity = String(
          Math.max(0.25, 1 - gesture.delta / gesture.height),
        );
      });
    },
    options,
  );
  function endGesture(event, cancelled = false) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dismiss =
      !cancelled &&
      (gesture.delta > Math.min(120, gesture.height * 0.22) ||
        (gesture.delta > 24 &&
          gesture.velocity > 0.55 &&
          event.timeStamp - gesture.time < 100));
    stopGesture();
    if (dismiss) close();
    else animateTo("translate3d(0, 0, 0)", 1, 240);
  }
  handle.addEventListener("pointerup", (event) => endGesture(event), options);
  handle.addEventListener(
    "pointercancel",
    (event) => endGesture(event, true),
    options,
  );
  handle.addEventListener(
    "lostpointercapture",
    (event) => endGesture(event, true),
    options,
  );
  doc.addEventListener(
    "movie-page-change",
    () => close({ immediate: true, restoreFocus: false }),
    options,
  );
  motion.addEventListener(
    "change",
    () => {
      if (!motion.matches || phase === "closed") return;
      if (phase === "closing") finishClose();
      else {
        ++version;
        stopGesture();
        stopMotion();
        panel.style.transform = "translate3d(0, 0, 0)";
        scrim.style.opacity = "1";
        phase = "open";
      }
    },
    options,
  );

  return {
    open,
    close,
    destroy() {
      destroyed = true;
      finishClose(false);
      controller.abort();
      dialog.remove();
    },
  };
}

export function readMovieDetails(trigger, env) {
  const card = trigger.closest(".movie-card, .movie-slide");
  const title = card
    ?.querySelector(".movie-card-title, h2")
    ?.textContent.trim();
  const image = card?.querySelector("img");
  if (!title || !image) return null;
  return {
    title,
    image: image.currentSrc || image.src,
    width: image.width,
    height: image.height,
    position: env.getComputedStyle(image).objectPosition,
    story: card.dataset.movieStory || getMovieStory(title),
  };
}

export function mountMovieDetails(doc, env) {
  const dialog = doc.createElement("dialog");
  dialog.className = "movie-drawer";
  dialog.setAttribute("aria-labelledby", "movie-drawer-title");
  dialog.innerHTML = `
    <div class="movie-drawer-scrim" aria-hidden="true"></div>
    <section class="movie-drawer-panel">
      <div class="movie-drawer-handle" aria-hidden="true"><span></span></div>
      <button class="movie-drawer-close" type="button" aria-label="Close movie details">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      <div class="movie-drawer-content">
        <div class="movie-drawer-art"><img alt="" decoding="async" /></div>
        <div class="movie-drawer-copy">
          <h2 id="movie-drawer-title"></h2>
          <p class="movie-drawer-eyebrow">Sample synopsis</p>
          <h3>Story</h3>
          <p class="movie-drawer-story"></p>
        </div>
      </div>
    </section>`;
  doc.body.append(dialog);
  const select = (name) => dialog.querySelector(`.movie-drawer-${name}`);
  const drawer = createDrawerController(
    {
      dialog,
      panel: select("panel"),
      scrim: select("scrim"),
      handle: select("handle"),
      closeButton: select("close"),
      content: select("content"),
      image: dialog.querySelector("img"),
      title: dialog.querySelector("h2"),
      story: select("story"),
    },
    env,
  );
  const controller = new env.AbortController();
  doc.addEventListener(
    "click",
    (event) => {
      const trigger = event.target.closest?.("button[data-movie-details]");
      if (!trigger || trigger.closest('[aria-hidden="true"], [inert]')) return;
      const movie = readMovieDetails(trigger, env);
      if (movie) drawer.open(movie, trigger);
    },
    { signal: controller.signal },
  );
  return () => {
    controller.abort();
    drawer.destroy();
  };
}

if (typeof document !== "undefined") {
  let dispose = mountMovieDetails(document, window);
  window.addEventListener("pagehide", () => dispose());
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      dispose();
      dispose = mountMovieDetails(document, window);
    }
  });
}
