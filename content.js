chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape") {
    const links = Array.from(document.querySelectorAll("a")).map((a) => a.href);
    sendResponse({ links: links });
  }
});
