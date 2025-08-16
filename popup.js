document.getElementById("scrapeBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    // First try to send message to existing content script
    chrome.tabs.sendMessage(tab.id, { action: "scrape" }, (response) => {
      if (chrome.runtime.lastError) {
        // If content script isn't available, inject it first
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ["content.js"],
          },
          () => {
            // Wait a moment for the script to load, then send message
            setTimeout(() => {
              chrome.tabs.sendMessage(
                tab.id,
                { action: "scrape" },
                (response) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error:", chrome.runtime.lastError.message);
                    document.getElementById("linkList").innerHTML =
                      "<li>Error: Could not connect to page</li>";
                    return;
                  }

                  displayLinks(response);
                }
              );
            }, 100);
          }
        );
      } else {
        displayLinks(response);
      }
    });
  });
});

function displayLinks(response) {
  const linkList = document.getElementById("linkList");
  linkList.innerHTML = "";
  if (response && response.links) {
    response.links.forEach((link) => {
      const li = document.createElement("li");
      li.textContent = link;
      linkList.appendChild(li);
    });
  }
}
