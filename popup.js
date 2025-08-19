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

function resetSearchButton(button, originalText) {
  button.textContent = originalText;
  button.disabled = false;
}

function showError(message) {
  const resultsContainer = document.getElementById("resultsContainer");
  const linkList = document.getElementById("linkList");
  
  if (resultsContainer && linkList) {
    resultsContainer.style.display = "block";
    linkList.innerHTML = `<div class="error">${message}</div>`;
  }
}

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

  // Show loading state
  const searchBtn = document.getElementById("searchBtn");
  const originalText = searchBtn.textContent;
  searchBtn.textContent = "Searching...";
  searchBtn.disabled = true;

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
                      showError("Could not search page");
                      resetSearchButton(searchBtn, originalText);
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
                        resetSearchButton(searchBtn, originalText);
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
                          showError("Could not search");
                        }
                        resetSearchButton(searchBtn, originalText);
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
              resetSearchButton(searchBtn, originalText);
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
                showError("Could not search");
              }
              resetSearchButton(searchBtn, originalText);
            });
        }
      }
    );
  });
});

function displaySearchResults(data) {
  const resultsContainer = document.getElementById("resultsContainer");
  const linkList = document.getElementById("linkList");
  const resultsTitle = document.getElementById("resultsTitle");
  const crawlInfo = document.getElementById("crawlInfo");
  
  if (!resultsContainer || !linkList || !resultsTitle || !crawlInfo) {
    console.error("Required DOM elements not found");
    return;
  }
  
  resultsContainer.style.display = "block";
  linkList.innerHTML = "";

  if (data.occurrences && data.occurrences.length > 0) {
    resultsTitle.textContent = `Found "${data.searchword}" ${data.total_occurrences} times`;

    // Add crawl information if available
    if (data.crawl_settings && data.crawl_settings.enabled) {
      crawlInfo.innerHTML = `
        <strong>Crawl Results:</strong> ${data.current_page_occurrences || 0} on current page, 
        ${data.crawled_occurrences || 0} on linked pages (${data.crawled_urls ? data.crawled_urls.length : 0} pages crawled)
      `;
    } else {
      crawlInfo.innerHTML = "";
    }

    // Group results by source URL
    const resultsByUrl = {};
    data.occurrences.forEach((occurrence, index) => {
      const sourceUrl = occurrence.source_url || data.url;
      if (!resultsByUrl[sourceUrl]) {
        resultsByUrl[sourceUrl] = [];
      }
      resultsByUrl[sourceUrl].push({ ...occurrence, originalIndex: index });
    });

    // Create dropdowns for each page
    Object.keys(resultsByUrl).forEach((url, urlIndex) => {
      const occurrences = resultsByUrl[url];
      const isCurrentPage = url === data.url;
      const pageIndicator = isCurrentPage ? "Current Page" : "Linked Page";
      const pageClass = isCurrentPage ? "current-page" : "linked-page";
      
      // Create dropdown container
      const dropdownContainer = document.createElement("div");
      dropdownContainer.className = "dropdown-container";
      
      // Create dropdown header
      const dropdownHeader = document.createElement("div");
      dropdownHeader.className = "dropdown-header";
      
      const headerText = document.createElement("span");
      headerText.textContent = `${pageIndicator} (${occurrences.length} results)`;
      
      const arrow = document.createElement("span");
      arrow.className = "dropdown-arrow";
      arrow.textContent = "▼";
      
      dropdownHeader.appendChild(headerText);
      dropdownHeader.appendChild(arrow);
      
      // Create dropdown content
      const dropdownContent = document.createElement("div");
      dropdownContent.className = "dropdown-content";
      
      // Add results to dropdown
      occurrences.forEach((occurrence, index) => {
        const resultItem = document.createElement("div");
        resultItem.className = "result-item";
        
        const resultHeader = document.createElement("div");
        resultHeader.className = "result-header";
        
        const resultTitle = document.createElement("span");
        resultTitle.className = "result-title";
        resultTitle.textContent = `Match ${occurrence.originalIndex + 1}`;
        
        const pageIndicatorSpan = document.createElement("span");
        pageIndicatorSpan.className = `page-indicator ${pageClass}`;
        pageIndicatorSpan.textContent = pageIndicator;
        
        resultHeader.appendChild(resultTitle);
        resultHeader.appendChild(pageIndicatorSpan);
        
        const resultContent = document.createElement("div");
        resultContent.className = "result-content";
        
        const contextText = document.createElement("div");
        contextText.innerHTML = `<strong>Context:</strong> ${
          occurrence.word_before || "START"
        } <span class="highlight-link" data-index="${occurrence.originalIndex}">${
          data.searchword
        }</span> ${occurrence.word_after || "END"}`;
        
        const contentText = document.createElement("div");
        contentText.innerHTML = `<strong>Content:</strong> ${occurrence.content.substring(0, 100)}...`;
        
        const positionText = document.createElement("div");
        positionText.innerHTML = `<strong>Position:</strong> ${occurrence.position}`;
        
        resultContent.appendChild(contextText);
        resultContent.appendChild(contentText);
        resultContent.appendChild(positionText);
        
        resultItem.appendChild(resultHeader);
        resultItem.appendChild(resultContent);
        
        // Add click event for highlighting
        const highlightLink = resultItem.querySelector('.highlight-link');
        if (highlightLink) {
          highlightLink.addEventListener('click', (e) => {
            e.preventDefault();
            highlightWord(occurrence.originalIndex);
          });
        }
        
        dropdownContent.appendChild(resultItem);
      });
      
      // Add click event to toggle dropdown
      dropdownHeader.addEventListener('click', () => {
        dropdownContent.classList.toggle('expanded');
        const arrow = dropdownHeader.querySelector('.dropdown-arrow');
        arrow.classList.toggle('expanded');
      });
      
      // Auto-expand current page dropdown
      if (isCurrentPage) {
        dropdownContent.classList.add('expanded');
        dropdownHeader.querySelector('.dropdown-arrow').classList.add('expanded');
      }
      
      dropdownContainer.appendChild(dropdownHeader);
      dropdownContainer.appendChild(dropdownContent);
      linkList.appendChild(dropdownContainer);
    });
  } else {
    resultsTitle.textContent = "No Results Found";
    crawlInfo.innerHTML = "";
    linkList.innerHTML = `<div class="loading">No occurrences of "${data.searchword}" found</div>`;
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
