// Store the current search results for highlighting
let currentSearchResults = null;
let highlightedElements = [];
let searchOverlay = null;
let shortcutEnabled = false;
let keyboardListener = null;

// Global dropdown toggle function - defined early so it's available
function toggleDropdown(dropdownId) {
  const content = document.getElementById(dropdownId);
  const arrow = document.getElementById(`arrow-${dropdownId}`);
  
  if (content.style.display === 'none' || content.style.display === '') {
    content.style.display = 'block';
    arrow.style.transform = 'rotate(180deg)';
  } else {
    content.style.display = 'none';
    arrow.style.transform = 'rotate(0deg)';
  }
}

// Global linked page click handler - defined early so it's available
function handleLinkedPageClick(dropdownId, url, searchword) {
  // First toggle the dropdown to show results
  toggleDropdown(dropdownId);
  
  // Then open the linked page in a new tab
  window.postMessage({
    type: 'betterFind-open-linked-page', 
    url: url, 
    searchword: searchword
  }, '*');
}

// Make functions globally available
window.toggleDropdown = toggleDropdown;
window.handleLinkedPageClick = handleLinkedPageClick;

// Test if content script is loaded
console.log('Better Find on Page content script loaded on:', window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request.action, 'on page:', window.location.href);
  
  if (request.action === "scrape") {
    const links = Array.from(document.querySelectorAll("a")).map((a) => a.href);
    sendResponse({ links: links });
  } else if (request.action === "highlightWord") {
    console.log('Highlighting word at index:', request.index, 'for searchword:', request.searchword);
    highlightWordOnPage(request.index, request.searchword);
    sendResponse({ success: true });
  } else if (request.action === "searchWords") {
    console.log('Searching for:', request.searchword, 'on page:', window.location.href);
    const results = searchWordsOnPage(request.searchword);
    currentSearchResults = results;
    console.log('Search results:', results);
    sendResponse({ results: results });
  } else if (request.action === "toggleShortcut") {
    shortcutEnabled = request.enabled;
    if (shortcutEnabled) {
      enableKeyboardShortcut();
    } else {
      disableKeyboardShortcut();
    }
    sendResponse({ success: true });
  } else if (request.action === "createSearchOverlay") {
    createSearchOverlay();
    sendResponse({ success: true });
  } else if (request.action === "hideSearchOverlay") {
    hideSearchOverlay();
    sendResponse({ success: true });
  }
});

function searchWordsOnPage(searchword) {
  console.log('Starting search for:', searchword);
  
  // Enhanced search that handles complex DOM structures better
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip script and style elements
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Skip hidden elements
        if (parent && (parent.style.display === 'none' || parent.style.visibility === 'hidden')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Only accept nodes with actual text content
        if (node.textContent.trim().length === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const occurrences = [];
  let node;
  let position = 0;

  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text.length === 0) continue;
    
    const regex = new RegExp(searchword, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null) {
      occurrences.push({
        node: node,
        startOffset: match.index,
        endOffset: match.index + searchword.length,
        position: position++,
        text: match[0]
      });
    }
  }

  console.log(`Found ${occurrences.length} occurrences of "${searchword}" on page`);
  
  // If no occurrences found with TreeWalker, try alternative method
  if (occurrences.length === 0) {
    console.log('No occurrences found with TreeWalker, trying alternative method...');
    return searchWordsAlternative(searchword);
  }
  
  return {
    searchword: searchword,
    occurrences: occurrences,
    total_occurrences: occurrences.length
  };
}

function searchWordsAlternative(searchword) {
  console.log('Using alternative search method');
  
  // Get all text content from the page
  const pageText = document.body.innerText || document.body.textContent || '';
  console.log('Page text length:', pageText.length);
  
  const occurrences = [];
  let position = 0;
  
  // Use a more robust regex that handles word boundaries
  const regex = new RegExp(`\\b${searchword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  let match;
  
  while ((match = regex.exec(pageText)) !== null) {
    // Find the corresponding DOM element
    const element = findElementContainingText(searchword);
    
    if (element) {
      occurrences.push({
        node: element.firstChild || element,
        startOffset: 0,
        endOffset: searchword.length,
        position: position++,
        text: match[0]
      });
    }
  }
  
  console.log(`Alternative method found ${occurrences.length} occurrences`);
  
  return {
    searchword: searchword,
    occurrences: occurrences,
    total_occurrences: occurrences.length
  };
}

function findElementContainingText(searchword) {
  // This is a simplified version - in practice, you'd need more sophisticated text mapping
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.includes(searchword)) {
      return node.parentElement;
    }
  }
  
  return null;
}

function highlightWordOnPage(index, searchword) {
  console.log('Highlighting word at index:', index, 'for searchword:', searchword);
  
  // Clear previous highlights
  clearHighlights();

  if (!currentSearchResults || !currentSearchResults.occurrences[index]) {
    console.error('No search results available for index:', index);
    // Try alternative approach - search for the word again
    console.log('Re-searching for word to get current results');
    const newResults = searchWordsOnPage(searchword);
    currentSearchResults = newResults;
    
    if (newResults.occurrences && newResults.occurrences.length > index) {
      // Now we have the results, proceed with highlighting
      console.log(`Found ${newResults.occurrences.length} occurrences, highlighting index ${index}`);
      highlightSpecificWord(index, searchword, newResults.occurrences[index]);
    } else {
      console.log(`Re-search found ${newResults.occurrences ? newResults.occurrences.length : 0} occurrences, but need index ${index}`);
      // Still no results, use alternative method
      highlightWordAlternative(index, searchword);
    }
    return;
  }

  highlightSpecificWord(index, searchword, currentSearchResults.occurrences[index]);
}

function highlightSpecificWord(index, searchword, occurrence) {
  const node = occurrence.node;
  const startOffset = occurrence.startOffset;
  const endOffset = occurrence.endOffset;

  try {
    // Create a range for the specific word
    const range = document.createRange();
    range.setStart(node, startOffset);
    range.setEnd(node, endOffset);

    // Create a highlight element
    const highlight = document.createElement('span');
    highlight.style.backgroundColor = '#ffff00';
    highlight.style.color = '#000000';
    highlight.style.padding = '2px';
    highlight.style.borderRadius = '3px';
    highlight.style.boxShadow = '0 0 5px rgba(255, 255, 0, 0.5)';
    highlight.style.position = 'relative';
    highlight.style.zIndex = '1000';
    highlight.id = 'betterFind-highlight';

    // Extract the text content
    const textContent = node.textContent;
    const beforeText = textContent.substring(0, startOffset);
    const highlightedText = textContent.substring(startOffset, endOffset);
    const afterText = textContent.substring(endOffset);

    // Create new text nodes
    const beforeNode = document.createTextNode(beforeText);
    const highlightedNode = document.createTextNode(highlightedText);
    const afterNode = document.createTextNode(afterText);

    // Replace the original text node with the new structure
    const parent = node.parentNode;
    const fragment = document.createDocumentFragment();
    
    if (beforeText) fragment.appendChild(beforeNode);
    highlight.appendChild(highlightedNode);
    fragment.appendChild(highlight);
    if (afterText) fragment.appendChild(afterNode);

    parent.replaceChild(fragment, node);
    highlightedElements.push(highlight);

    console.log('Highlighted element created:', highlight);

    // Scroll to the highlighted element
    highlight.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });

    // Add a temporary flash effect
    setTimeout(() => {
      highlight.style.backgroundColor = '#ffeb3b';
      highlight.style.boxShadow = '0 0 10px rgba(255, 235, 59, 0.8)';
    }, 100);

    setTimeout(() => {
      highlight.style.backgroundColor = '#ffff00';
      highlight.style.boxShadow = '0 0 5px rgba(255, 255, 0, 0.5)';
    }, 300);

  } catch (error) {
    console.error('Error highlighting word:', error);
    // Try alternative approach
    highlightWordAlternative(index, searchword);
  }
}

function highlightWordAlternative(index, searchword) {
  console.log('Using alternative highlighting method for index:', index);
  
  // Find all text nodes containing the search word
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.toLowerCase().includes(searchword.toLowerCase())) {
      textNodes.push(node);
    }
  }
  
  console.log(`Alternative method found ${textNodes.length} text nodes containing "${searchword}"`);
  
  if (textNodes[index]) {
    const targetNode = textNodes[index];
    console.log(`Highlighting text node ${index}:`, targetNode.textContent.substring(0, 50) + '...');
    
    // Create a temporary highlight
    const tempHighlight = document.createElement('span');
    tempHighlight.style.backgroundColor = '#ffff00';
    tempHighlight.style.color = '#000000';
    tempHighlight.style.padding = '2px';
    tempHighlight.style.borderRadius = '3px';
    tempHighlight.style.boxShadow = '0 0 5px rgba(255, 255, 0, 0.5)';
    tempHighlight.style.position = 'relative';
    tempHighlight.style.zIndex = '1000';
    tempHighlight.id = 'betterFind-highlight-temp';
    
    // Wrap the text node
    const parent = targetNode.parentNode;
    const wrapper = document.createElement('span');
    wrapper.appendChild(tempHighlight);
    tempHighlight.appendChild(targetNode.cloneNode(true));
    parent.replaceChild(wrapper, targetNode);
    
    highlightedElements.push(tempHighlight);
    
    // Scroll to the element
    tempHighlight.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
    
    // Flash effect
    setTimeout(() => {
      tempHighlight.style.backgroundColor = '#ffeb3b';
      tempHighlight.style.boxShadow = '0 0 10px rgba(255, 235, 59, 0.8)';
    }, 100);
    
    setTimeout(() => {
      tempHighlight.style.backgroundColor = '#ffff00';
      tempHighlight.style.boxShadow = '0 0 5px rgba(255, 255, 0, 0.5)';
    }, 300);
  } else {
    console.error(`Alternative method failed: found ${textNodes.length} text nodes but need index ${index}`);
    // Last resort: try to find any occurrence and highlight it
    if (textNodes.length > 0) {
      console.log('Highlighting first available text node as fallback');
      const targetNode = textNodes[0];
      
      // Create a temporary highlight
      const tempHighlight = document.createElement('span');
      tempHighlight.style.backgroundColor = '#ff6b6b';
      tempHighlight.style.color = '#ffffff';
      tempHighlight.style.padding = '2px';
      tempHighlight.style.borderRadius = '3px';
      tempHighlight.style.boxShadow = '0 0 5px rgba(255, 107, 107, 0.5)';
      tempHighlight.style.position = 'relative';
      tempHighlight.style.zIndex = '1000';
      tempHighlight.id = 'betterFind-highlight-fallback';
      tempHighlight.title = `Fallback highlight (wanted index ${index}, found ${textNodes.length} nodes)`;
      
      // Wrap the text node
      const parent = targetNode.parentNode;
      const wrapper = document.createElement('span');
      wrapper.appendChild(tempHighlight);
      tempHighlight.appendChild(targetNode.cloneNode(true));
      parent.replaceChild(wrapper, targetNode);
      
      highlightedElements.push(tempHighlight);
      
      // Scroll to the element
      tempHighlight.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }
  }
}

function clearHighlights() {
  highlightedElements.forEach(element => {
    if (element && element.parentNode) {
      try {
        // Restore the original text node
        const parent = element.parentNode;
        const textContent = element.textContent;
        const textNode = document.createTextNode(textContent);
        parent.replaceChild(textNode, element);
      } catch (error) {
        console.error('Error clearing highlight:', error);
      }
    }
  });
  highlightedElements = [];
}

// Keyboard shortcut functions
function enableKeyboardShortcut() {
  if (keyboardListener) {
    disableKeyboardShortcut();
  }
  
  keyboardListener = (event) => {
    // Check for Ctrl+F (or Cmd+F on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault();
      event.stopPropagation();
      
      // Create the search overlay
      createSearchOverlay();
      
      // Focus on the search input
      setTimeout(() => {
        const searchInput = document.getElementById('betterFind-search-input');
        if (searchInput) {
          searchInput.focus();
        }
      }, 100);
    }
  };
  
  document.addEventListener('keydown', keyboardListener, true);
  console.log('Keyboard shortcut enabled (Ctrl+F)');
}

function disableKeyboardShortcut() {
  if (keyboardListener) {
    document.removeEventListener('keydown', keyboardListener, true);
    keyboardListener = null;
    console.log('Keyboard shortcut disabled');
  }
}

// Initialize shortcut state on page load
chrome.storage.sync.get(['shortcutEnabled'], (result) => {
  shortcutEnabled = result.shortcutEnabled || false;
  if (shortcutEnabled) {
    enableKeyboardShortcut();
  }
});

// Search overlay functions
function createSearchOverlay() {
  // Remove existing overlay if any
  if (searchOverlay) {
    searchOverlay.remove();
  }

  // Create the overlay container
  searchOverlay = document.createElement('div');
  searchOverlay.id = 'betterFind-overlay';
  searchOverlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 350px;
    max-height: 80vh;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  // Create header
  const header = document.createElement('div');
  header.style.cssText = `
    background: #007bff;
    color: white;
    padding: 12px 16px;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = `
    <span>Better Find on Page</span>
    <button id="betterFind-close" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px;">×</button>
  `;

  // Create search input section
  const searchSection = document.createElement('div');
  searchSection.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid #eee;
  `;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Enter a word to search...';
  searchInput.id = 'betterFind-search-input';
  searchInput.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    margin-bottom: 8px;
    box-sizing: border-box;
  `;

  const searchButton = document.createElement('button');
  searchButton.textContent = 'Search';
  searchButton.id = 'betterFind-search-btn';
  searchButton.style.cssText = `
    background: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    width: 100%;
  `;

  // Create results container
  const resultsContainer = document.createElement('div');
  resultsContainer.id = 'betterFind-results';
  resultsContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    max-height: 400px;
  `;

  // Assemble the overlay
  searchSection.appendChild(searchInput);
  searchSection.appendChild(searchButton);
  searchOverlay.appendChild(header);
  searchOverlay.appendChild(searchSection);
  searchOverlay.appendChild(resultsContainer);

  // Add to page
  document.body.appendChild(searchOverlay);

  // Add event listeners
  document.getElementById('betterFind-close').addEventListener('click', hideSearchOverlay);
  document.getElementById('betterFind-search-btn').addEventListener('click', performSearch);
  document.getElementById('betterFind-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Focus on input
  searchInput.focus();
}

function hideSearchOverlay() {
  if (searchOverlay) {
    searchOverlay.remove();
    searchOverlay = null;
  }
}

function performSearch() {
  const searchInput = document.getElementById('betterFind-search-input');
  const searchword = searchInput.value.trim();
  
  if (!searchword) {
    alert('Please enter a search word');
    return;
  }

  const resultsContainer = document.getElementById('betterFind-results');
  resultsContainer.innerHTML = '<div style="text-align: center; color: #666;">Searching...</div>';

  // Get current page URL
  const currentUrl = window.location.href;

  // First, get page occurrences
  const pageResults = searchWordsOnPage(searchword);
  currentSearchResults = pageResults;

  // Now call the Flask API for additional context with intelligent crawling
  fetch(
    `https://munneth52.pythonanywhere.com/api/words/advanced?url=${encodeURIComponent(
      currentUrl
    )}&searchword=${encodeURIComponent(searchword)}&crawl=true&max_depth=1&max_links=5`
  )
    .then((response) => response.json())
    .then((data) => {
      console.log("API response:", data);
      // Merge content script results with API results
      const mergedData = {
        ...data,
        page_occurrences: pageResults
      };
      
      // If API didn't return occurrences, use content script results
      if (!mergedData.occurrences || mergedData.occurrences.length === 0) {
        console.log("No API results, using content script results");
        mergedData.occurrences = pageResults.occurrences.map((occ, index) => ({
          word_before: "",
          word_after: "",
          content: occ.text,
          position: occ.position,
          source_url: currentUrl
        }));
        mergedData.total_occurrences = pageResults.total_occurrences;
        mergedData.url = currentUrl;
      } else {
        // API returned results, ensure all occurrences have source_url
        mergedData.occurrences.forEach(occ => {
          if (!occ.source_url) {
            occ.source_url = currentUrl;
          }
        });
      }
      
      displayOverlayResults(mergedData, resultsContainer);
    })
    .catch((error) => {
      console.error("Error:", error);
      // If API fails, still show page results
      if (pageResults && pageResults.occurrences) {
        console.log("API failed, using content script results");
        const pageData = {
          searchword: searchword,
          occurrences: pageResults.occurrences.map((occ, index) => ({
            word_before: "",
            word_after: "",
            content: occ.text,
            position: occ.position,
            source_url: currentUrl
          })),
          total_occurrences: pageResults.total_occurrences,
          page_occurrences: pageResults,
          url: currentUrl
        };
        displayOverlayResults(pageData, resultsContainer);
      } else {
        resultsContainer.innerHTML = '<div style="text-align: center; color: #666;">No results found</div>';
      }
    });
}

function displayOverlayResults(results, container) {
  if (!results || !results.occurrences || results.occurrences.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #666;">No results found</div>';
    return;
  }

  const searchword = results.searchword;
  let html = `
    <div style="margin-bottom: 12px; padding: 8px; background: #f8f9fa; border-radius: 4px; font-size: 12px;">
      Found "${searchword}" ${results.total_occurrences} times
    </div>
  `;

  // Add crawl information if available
  if (results.crawl_settings && results.crawl_settings.enabled) {
    html += `
      <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 4px; font-size: 11px; color: #1976d2;">
        <strong>Crawl Results:</strong> ${results.current_page_occurrences || 0} on current page, 
        ${results.crawled_occurrences || 0} on linked pages (${results.crawled_urls ? results.crawled_urls.length : 0} pages crawled)
      </div>
    `;
  }

  // Group results by source URL
  const resultsByUrl = {};
  results.occurrences.forEach((occurrence, index) => {
    const sourceUrl = occurrence.source_url || results.url;
    if (!resultsByUrl[sourceUrl]) {
      resultsByUrl[sourceUrl] = [];
    }
    resultsByUrl[sourceUrl].push({ ...occurrence, originalIndex: index });
  });

  // Create collapsible sections for each page
  Object.keys(resultsByUrl).forEach((url, urlIndex) => {
    const occurrences = resultsByUrl[url];
    const isCurrentPage = url === results.url;
    const pageIndicator = isCurrentPage ? "Current Page" : "Linked Page";
    const dropdownId = `dropdown-${urlIndex}`;
    
         // Create dropdown header
     if (isCurrentPage) {
       html += `
         <div class="dropdown-header" data-dropdown-id="${dropdownId}" data-action="toggle" style="
           margin-bottom: 8px; 
           padding: 10px 12px; 
           background: #d4edda; 
           border-radius: 4px; 
           font-size: 12px; 
           font-weight: 600; 
           color: #155724;
           cursor: pointer;
           display: flex;
           justify-content: space-between;
           align-items: center;
           border: 1px solid #c3e6cb;
           transition: background-color 0.2s;
         ">
           <span>${pageIndicator} (${occurrences.length} results)</span>
           <span class="dropdown-arrow" id="arrow-${dropdownId}" style="font-size: 14px; transition: transform 0.2s;">▼</span>
         </div>
       `;
     } else {
       html += `
         <div class="dropdown-header" data-dropdown-id="${dropdownId}" data-action="linked-page" data-url="${url}" data-searchword="${searchword}" style="
           margin-bottom: 8px; 
           padding: 10px 12px; 
           background: #fff3cd; 
           border-radius: 4px; 
           font-size: 12px; 
           font-weight: 600; 
           color: #856404;
           cursor: pointer;
           display: flex;
           justify-content: space-between;
           align-items: center;
           border: 1px solid #ffeaa7;
           transition: background-color 0.2s;
         ">
           <span>${pageIndicator} (${occurrences.length} results) - Click to open page</span>
           <span class="dropdown-arrow" id="arrow-${dropdownId}" style="font-size: 14px; transition: transform 0.2s;">▼</span>
         </div>
       `;
     }
    
    // Create dropdown content container
    html += `
      <div id="${dropdownId}" class="dropdown-content" style="
        display: none;
        margin-bottom: 12px;
        padding: 8px;
        background: #f8f9fa;
        border-radius: 4px;
        border: 1px solid #e9ecef;
        max-height: 300px;
        overflow-y: auto;
      ">
    `;
    
    // Results for this page
    occurrences.forEach((occurrence, index) => {
      const context = occurrence.word_before || "START";
      const afterContext = occurrence.word_after || "END";
      
      html += `
        <div style="margin-bottom: 8px; padding: 10px; border: 1px solid #eee; border-radius: 4px; cursor: pointer; background: white; transition: background-color 0.2s;" 
             onclick="window.postMessage({type: 'betterFind-highlight', index: ${occurrence.originalIndex}, searchword: '${searchword}'}, '*')"
             onmouseover="this.style.background='#f8f9fa'" 
             onmouseout="this.style.background='white'">
          <div style="font-weight: 600; margin-bottom: 4px; font-size: 12px;">Match ${occurrence.originalIndex + 1}</div>
          <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Position: ${occurrence.position}</div>
          <div style="font-size: 11px; margin-bottom: 4px;">
            <strong>Context:</strong> ${context} <span style="background: #ffff00; padding: 1px 2px; border-radius: 2px;">${searchword}</span> ${afterContext}
          </div>
          <div style="font-size: 11px; color: #666;">
            <strong>Content:</strong> ${occurrence.content ? occurrence.content.substring(0, 80) + '...' : occurrence.text}
          </div>
        </div>
      `;
    });
    
    // Close dropdown content
    html += `</div>`;
  });

  container.innerHTML = html;
  
  // Add event listeners for dropdown functionality
  const dropdownHeaders = container.querySelectorAll('.dropdown-header');
  dropdownHeaders.forEach(header => {
    const action = header.getAttribute('data-action');
    const dropdownId = header.getAttribute('data-dropdown-id');
    
    // Add hover effects
    if (action === 'toggle') {
      header.addEventListener('mouseover', () => {
        header.style.background = '#c3e6cb';
      });
      header.addEventListener('mouseout', () => {
        header.style.background = '#d4edda';
      });
    } else if (action === 'linked-page') {
      header.addEventListener('mouseover', () => {
        header.style.background = '#ffeaa7';
      });
      header.addEventListener('mouseout', () => {
        header.style.background = '#fff3cd';
      });
    }
    
    // Add click handlers
    header.addEventListener('click', () => {
      if (action === 'toggle') {
        toggleDropdown(dropdownId);
      } else if (action === 'linked-page') {
        const url = header.getAttribute('data-url');
        const searchword = header.getAttribute('data-searchword');
        handleLinkedPageClick(dropdownId, url, searchword);
      }
    });
  });
}

// Listen for highlight messages from the overlay
window.addEventListener('message', (event) => {
  if (event.data.type === 'betterFind-highlight') {
    highlightWordOnPage(event.data.index, event.data.searchword);
  } else if (event.data.type === 'betterFind-open-linked-page') {
    openLinkedPage(event.data.url, event.data.searchword);
  }
});

function openLinkedPage(url, searchword) {
  // Open the linked page in a new tab
  chrome.runtime.sendMessage({
    action: "openLinkedPage",
    url: url,
    searchword: searchword
  });
}
