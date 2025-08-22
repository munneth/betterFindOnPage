// Store the current search results for highlighting
let currentSearchResults = null;
let highlightedElements = [];

// Test if content script is loaded
console.log('Better Find on Page content script loaded on:', window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request.action);
  
  if (request.action === "scrape") {
    const links = Array.from(document.querySelectorAll("a")).map((a) => a.href);
    sendResponse({ links: links });
  } else if (request.action === "highlightWord") {
    highlightWordOnPage(request.index, request.searchword);
    sendResponse({ success: true });
  } else if (request.action === "searchWords") {
    console.log('Searching for:', request.searchword);
    const results = searchWordsOnPage(request.searchword);
    currentSearchResults = results;
    console.log('Search results:', results);
    sendResponse({ results: results });
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
  console.log('Highlighting word at index:', index);
  
  // Clear previous highlights
  clearHighlights();

  if (!currentSearchResults || !currentSearchResults.occurrences[index]) {
    console.error('No search results available for index:', index);
    // Try alternative approach
    highlightWordAlternative(index, searchword);
    return;
  }

  const occurrence = currentSearchResults.occurrences[index];
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
  console.log('Using alternative highlighting method');
  
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
  
  if (textNodes[index]) {
    const targetNode = textNodes[index];
    
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
