function bindChapterLabels(root = document) {
  root.querySelectorAll(".chapter-link-wrapper > span:not([data-fold])").forEach((label) => {
    const toggle = label.parentElement?.querySelector(":scope > .chapter-fold-toggle");
    if (!toggle) return;
    label.dataset.fold = "1";
    label.addEventListener("click", (event) => {
      event.preventDefault();
      toggle.click();
    });
  });
}

bindChapterLabels();

const sidebar = document.querySelector("mdbook-sidebar-scrollbox");
if (sidebar) {
  const observer = new MutationObserver(() => bindChapterLabels(sidebar));
  observer.observe(sidebar, { childList: true, subtree: true });
}
