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

// Add event listener for search button
document.getElementById("searchBtn").addEventListener("click", () => {
  const searchword = document.getElementById("searchword").value;
  if (!searchword) {
    alert("Please enter a search word");
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const currentUrl = tab.url;

    // Call your Flask API
    fetch(
      `http://127.0.0.1:5000/api/words?url=${encodeURIComponent(
        currentUrl
      )}&searchword=${encodeURIComponent(searchword)}`
    )
      .then((response) => response.json())
      .then((data) => {
        displaySearchResults(data);
      })
      .catch((error) => {
        console.error("Error:", error);
        document.getElementById("linkList").innerHTML =
          "<li>Error: Could not search</li>";
      });
  });
});

function displaySearchResults(data) {
  const linkList = document.getElementById("linkList");
  linkList.innerHTML = "";

  if (data.occurrences && data.occurrences.length > 0) {
    const title = document.createElement("h3");
    title.textContent = `Found "${data.searchword}" ${data.total_occurrences} times:`;
    linkList.appendChild(title);

    data.occurrences.forEach((occurrence, index) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>Match ${index + 1}:</strong><br>
        <em>Context:</em> ${occurrence.word_before || "START"} <strong>${
        data.searchword
      }</strong> ${occurrence.word_after || "END"}<br>
        <em>Content:</em> ${occurrence.content.substring(0, 100)}...
      `;
      linkList.appendChild(li);
    });
  } else {
    linkList.innerHTML = `<li>No occurrences of "${data.searchword}" found</li>`;
  }
}
