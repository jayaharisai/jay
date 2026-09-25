const navItems = [...document.querySelectorAll(".nav-item")];

function updateActiveItem() {
  const selected =
    navItems.find((item) => item.hash === window.location.hash) ?? navItems[0];

  navItems.forEach((item) => {
    const isActive = item === selected;
    item.classList.toggle("is-active", isActive);

    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

window.addEventListener("hashchange", updateActiveItem);
updateActiveItem();
