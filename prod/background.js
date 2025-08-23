// Background script for Better Find on Page extension

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openLinkedPage") {
    console.log('Opening linked page:', request.url, 'with searchword:', request.searchword);
    
    // Open the linked page in a new tab
    chrome.tabs.create({
      url: request.url,
      active: false
    }, (newTab) => {
      console.log('Created new tab:', newTab.id);
      
      // Wait for the page to load, then search for the word
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          console.log('Page loaded, searching for word:', request.searchword);
          
          // Remove the listener
          chrome.tabs.onUpdated.removeListener(listener);
          
          // Inject content script and search for the word
          chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            files: ["content.js"]
          }, () => {
            console.log('Content script injected into new tab');
            
            // Wait a bit for the content script to initialize
            setTimeout(() => {
              // First, search for the word
              chrome.tabs.sendMessage(newTab.id, {
                action: "searchWords",
                searchword: request.searchword
              }, (searchResponse) => {
                console.log('Search response from new tab:', searchResponse);
                
                if (searchResponse && searchResponse.results && searchResponse.results.occurrences && searchResponse.results.occurrences.length > 0) {
                  console.log(`Found ${searchResponse.results.occurrences.length} occurrences, highlighting first one`);
                  
                  // Highlight the first occurrence
                  chrome.tabs.sendMessage(newTab.id, {
                    action: "highlightWord",
                    index: 0,
                    searchword: request.searchword
                  }, (highlightResponse) => {
                    console.log('Highlight response:', highlightResponse);
                    
                    // Activate the new tab and bring it to front
                    chrome.tabs.update(newTab.id, { active: true });
                    chrome.windows.update(newTab.windowId, { focused: true });
                  });
                } else {
                  console.log('No occurrences found on linked page');
                  // Still activate the tab even if no results
                  chrome.tabs.update(newTab.id, { active: true });
                  chrome.windows.update(newTab.windowId, { focused: true });
                }
              });
            }, 1500); // Increased timeout to ensure content script is ready
          });
        }
      });
    });
    
    // Send response immediately
    sendResponse({ success: true });
  }
});
