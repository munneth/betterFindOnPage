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

    // First, send the search word to content script to get page occurrences
    chrome.tabs.sendMessage(
      tab.id,
      { action: "searchWords", searchword: searchword },
      (contentResponse) => {
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
                  { action: "searchWords", searchword: searchword },
                  (contentResponse) => {
                    if (chrome.runtime.lastError) {
                      console.error("Error:", chrome.runtime.lastError.message);
                      document.getElementById("linkList").innerHTML =
                        "<li>Error: Could not search page</li>";
                      return;
                    }
                    
                    // Now call your Flask API for additional context
                    fetch(
                      `http://127.0.0.1:5000/api/words?url=${encodeURIComponent(
                        currentUrl
                      )}&searchword=${encodeURIComponent(searchword)}`
                    )
                      .then((response) => response.json())
                      .then((data) => {
                        console.log("Works");
                        // Merge content script results with API results
                        const mergedData = {
                          ...data,
                          page_occurrences: contentResponse.results
                        };
                        displaySearchResults(mergedData);
                      })
                      .catch((error) => {
                        console.error("Error:", error);
                        // If API fails, still show page results
                        if (contentResponse && contentResponse.results) {
                          const pageData = {
                            searchword: searchword,
                            occurrences: contentResponse.results.occurrences.map((occ, index) => ({
                              word_before: "",
                              word_after: "",
                              content: occ.text,
                              position: occ.position
                            })),
                            total_occurrences: contentResponse.results.total_occurrences,
                            page_occurrences: contentResponse.results
                          };
                          displaySearchResults(pageData);
                        } else {
                          document.getElementById("linkList").innerHTML =
                            "<li>Error: Could not search</li>";
                        }
                      });
                  }
                );
              }, 100);
            }
          );
        } else {
          // Content script is available, proceed with API call
          fetch(
            `http://127.0.0.1:5000/api/words?url=${encodeURIComponent(
              currentUrl
            )}&searchword=${encodeURIComponent(searchword)}`
          )
            .then((response) => response.json())
            .then((data) => {
              console.log("Works");
              // Merge content script results with API results
              const mergedData = {
                ...data,
                page_occurrences: contentResponse.results
              };
              displaySearchResults(mergedData);
            })
            .catch((error) => {
              console.error("Error:", error);
              // If API fails, still show page results
              if (contentResponse && contentResponse.results) {
                const pageData = {
                  searchword: searchword,
                  occurrences: contentResponse.results.occurrences.map((occ, index) => ({
                    word_before: "",
                    word_after: "",
                    content: occ.text,
                    position: occ.position
                  })),
                  total_occurrences: contentResponse.results.total_occurrences,
                  page_occurrences: contentResponse.results
                };
                displaySearchResults(pageData);
              } else {
                document.getElementById("linkList").innerHTML =
                  "<li>Error: Could not search</li>";
              }
            });
        }
      }
    );
  });
});

function displaySearchResults(data) {
  const linkList = document.getElementById("linkList");
  linkList.innerHTML = "";

  if (data.occurrences && data.occurrences.length > 0) {
    const title = document.createElement("h3");
    title.textContent = `Found "${data.searchword}" ${data.total_occurrences} times`;
    linkList.appendChild(title);

    // Display array index information
    const indexInfo = document.createElement("p");
    indexInfo.innerHTML = `<strong> [${data.occurrences
      .map((_, i) => i)
      .join(", ")}]</strong>`;
    linkList.appendChild(indexInfo);



    data.occurrences.forEach((occurrence, index) => {
      const li = document.createElement("li");
      li.style.marginBottom = "10px";
      li.style.padding = "8px";
      li.style.border = "1px solid #ddd";
      li.style.borderRadius = "5px";
      li.style.backgroundColor = "#f9f9f9";
      
      li.innerHTML = `
        <strong>Match ${index + 1}:</strong><br>
        <em>Context:</em> ${
          occurrence.word_before || "START"
        } <a href="#" class="highlight-link" data-index="${index}" style="color: #0066cc; text-decoration: underline; font-weight: bold; background-color: #e6f3ff; padding: 2px 4px; border-radius: 3px; cursor: pointer;">${
        data.searchword
      }</a> ${occurrence.word_after || "END"}<br>
        <em>Content:</em> ${occurrence.content.substring(0, 100)}...<br>
        <em>Word Position:</em> ${occurrence.position}
      `;
      
      // Add event listener to the link
      const link = li.querySelector('.highlight-link');
      link.addEventListener('click', (e) => {
        e.preventDefault();
        highlightWord(index);
      });
      
      linkList.appendChild(li);
    });
  } else {
    linkList.innerHTML = `<li>No occurrences of "${data.searchword}" found</li>`;
  }
}

// Function to handle word highlighting
function highlightWord(index) {
  console.log(`Clicked on word at index: ${index}`);

  // Get the searchword from the input field
  const searchword = document.getElementById("searchword").value;

  // Send message to content script to highlight the word
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "highlightWord",
        index: index,
        searchword: searchword,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log("Could not send highlight message to content script");
          // Try to inject content script if it's not available
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              files: ["content.js"],
            },
            () => {
              setTimeout(() => {
                chrome.tabs.sendMessage(
                  tab.id,
                  {
                    action: "highlightWord",
                    index: index,
                    searchword: searchword,
                  },
                  (response) => {
                    if (chrome.runtime.lastError) {
                      console.log("Still could not highlight word");
                      // Fallback: use browser's find functionality
                      chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (searchTerm, targetIndex) => {
                          console.log('Using fallback method for:', searchTerm, 'at index:', targetIndex);
                          
                          // Simple approach: find all text nodes and scroll to the target
                          const textNodes = [];
                          const walker = document.createTreeWalker(
                            document.body,
                            NodeFilter.SHOW_TEXT,
                            null,
                            false
                          );
                          
                          let node;
                          while (node = walker.nextNode()) {
                            if (node.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
                              textNodes.push(node);
                            }
                          }
                          
                          console.log('Found', textNodes.length, 'text nodes containing the word');
                          
                          if (textNodes[targetIndex]) {
                            textNodes[targetIndex].scrollIntoView({
                              behavior: 'smooth',
                              block: 'center',
                              inline: 'center'
                            });
                            
                            // Add a temporary highlight
                            const highlight = document.createElement('span');
                            highlight.style.backgroundColor = '#ffff00';
                            highlight.style.color = '#000000';
                            highlight.style.padding = '2px';
                            highlight.style.borderRadius = '3px';
                            highlight.style.boxShadow = '0 0 5px rgba(255, 255, 0, 0.5)';
                            highlight.style.position = 'relative';
                            highlight.style.zIndex = '1000';
                            highlight.textContent = searchTerm;
                            
                            // Insert the highlight before the text node
                            const parent = textNodes[targetIndex].parentNode;
                            parent.insertBefore(highlight, textNodes[targetIndex]);
                            
                            // Remove highlight after 3 seconds
                            setTimeout(() => {
                              if (highlight.parentNode) {
                                highlight.parentNode.removeChild(highlight);
                              }
                            }, 3000);
                          }
                        },
                        args: [searchword, index]
                      });
                    } else {
                      console.log("Word highlighted successfully");
                    }
                  }
                );
              }, 100);
            }
          );
        } else {
          console.log("Word highlighted successfully");
        }
      }
    );
  });
}
