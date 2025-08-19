import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin, urlparse
import time
from collections import Counter

URL = "https://en.wikipedia.org/wiki/Lee_Resolution"

# fetch the content of the url
def getContent(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            print(f"Successfully retrieved {url}")
            return response.text
        else:
            print(f"Failed to retrieve {url} - Status: {response.status_code}")
            return None
    except Exception as e:
        print(f"Failed to retrieve {url} - Error: {str(e)}")
        return None

def getRelevantLinks(content, base_url, max_links=5):
    """
    Find the most relevant links on a page based on:
    1. Internal links (same domain)
    2. Link text relevance
    3. Link frequency
    """
    soup = BeautifulSoup(content, 'html.parser')
    links = []
    
    # Remove script and style elements
    for script in soup(["script", "style"]):
        script.decompose()
    
    # Find all links
    for link in soup.find_all('a', href=True):
        href = link.get('href')
        text = link.get_text(strip=True)
        
        # Skip empty links or javascript links
        if not href or href.startswith('javascript:') or href.startswith('#'):
            continue
            
        # Make relative URLs absolute
        absolute_url = urljoin(base_url, href)
        
        # Only include internal links (same domain)
        if urlparse(absolute_url).netloc == urlparse(base_url).netloc:
            # Calculate relevance score
            relevance_score = calculateLinkRelevance(text, href)
            
            links.append({
                'url': absolute_url,
                'text': text,
                'href': href,
                'relevance_score': relevance_score
            })
    
    # Sort by relevance score and return top links
    links.sort(key=lambda x: x['relevance_score'], reverse=True)
    return links[:max_links]

def calculateLinkRelevance(link_text, href):
    """
    Calculate relevance score for a link based on:
    - Link text length (longer is better)
    - Presence of keywords in link text
    - Link structure
    """
    score = 0
    
    # Base score for having text
    if link_text:
        score += len(link_text) * 0.1
    
    # Bonus for descriptive link text
    descriptive_keywords = ['article', 'page', 'section', 'chapter', 'guide', 'tutorial', 'documentation']
    for keyword in descriptive_keywords:
        if keyword.lower() in link_text.lower():
            score += 5
    
    # Bonus for meaningful href (not just IDs)
    if not href.startswith('#') and len(href) > 3:
        score += 3
    
    # Penalty for very short or generic text
    if len(link_text) < 3:
        score -= 5
    
    return score

def crawlAndSearch(url, searchword, max_depth=1, max_links_per_page=5):
    """
    Crawl a page and its most relevant links to search for a word
    """
    print(f"Starting crawl for '{searchword}' on {url}")
    
    all_results = []
    crawled_urls = set()
    
    def crawlPage(current_url, depth=0):
        if depth > max_depth or current_url in crawled_urls:
            return
        
        crawled_urls.add(current_url)
        print(f"Crawling {current_url} (depth {depth})")
        
        # Get page content
        content = getContent(current_url)
        if not content:
            return
        
        # Search for word on current page
        page_results = findWord(searchword, content)
        for result in page_results:
            result['source_url'] = current_url
            result['depth'] = depth
        
        all_results.extend(page_results)
        
        # If we haven't reached max depth, find and crawl relevant links
        if depth < max_depth:
            relevant_links = getRelevantLinks(content, current_url, max_links_per_page)
            
            for link_info in relevant_links:
                link_url = link_info['url']
                if link_url not in crawled_urls:
                    # Add a small delay to be respectful
                    time.sleep(0.5)
                    crawlPage(link_url, depth + 1)
    
    # Start crawling from the main URL
    crawlPage(url)
    
    return all_results

def findWord(searchWord, content):
    soup = BeautifulSoup(content, 'html.parser')
    results = soup.body.find_all(string=re.compile('.*{0}.*'.format(searchWord), re.IGNORECASE), recursive=True)

    print('Found the word "{0}" {1} times\n'.format(searchWord, len(results)))

    word_occurrences = []  # Array to store results
    
    for text_content in results:
        # Get the parent element that contains this text
        parent_element = text_content.parent
        
        # Generate XPath for the parent element
        xpath = get_xpath(parent_element)
        
        words = text_content.split()
        for index, word in enumerate(words):
            # Skip None or empty words
            if not word:
                continue
            # If the content contains the search word twice or more this will fire for each occurence
            if word.lower() == searchWord.lower():
                print('Whole content: "{0}"'.format(text_content))
                print('XPath: {0}'.format(xpath))
                before = None
                after = None
                # Check if it's a first word
                if index != 0:
                    before = words[index-1]
                # Check if it's a last word
                if index != len(words)-1:
                    after = words[index+1]
                print('\tWord before: "{0}", word after: "{1}"'.format(before, after))
                
                # Add to array
                word_occurrences.append({
                    'content': text_content,
                    'word_before': before,
                    'word_after': after,
                    'position': index,
                    'xpath': xpath
                })
    
    return word_occurrences  # Return the array

def get_xpath(element):
    """Generate XPath for a BeautifulSoup element"""
    if element is None:
        return ""
    
    # If it's the root element
    if element.name == '[document]':
        return "/"
    
    # If it's the html element
    if element.name == 'html':
        return "/html"
    
    # If it's the body element
    if element.name == 'body':
        return "/html/body"
    
    # For other elements, build the path
    path = []
    current = element
    
    while current and current.name not in ['html', 'body', '[document]']:
        # Get the tag name
        tag_name = current.name if current.name else 'text()'
        
        # Count siblings with the same tag name
        siblings = current.find_previous_siblings(tag_name)
        position = len(siblings) + 1
        
        # Add position if there are multiple siblings
        if position > 1:
            path.append(f"{tag_name}[{position}]")
        else:
            path.append(tag_name)
        
        current = current.parent
    
    # Reverse the path and join
    path.reverse()
    return "/" + "/".join(path)

# Test the enhanced crawler
if __name__ == "__main__":
    test_url = "https://en.wikipedia.org/wiki/Lee_Resolution"
    test_word = "ought"
    
    print("Testing enhanced crawler...")
    results = crawlAndSearch(test_url, test_word, max_depth=1, max_links_per_page=3)
    
    print(f"\nTotal results found: {len(results)}")
    for i, result in enumerate(results[:5]):  # Show first 5 results
        print(f"\nResult {i+1}:")
        print(f"URL: {result.get('source_url', 'Unknown')}")
        print(f"Content: {result['content'][:100]}...")
        print(f"Word before: {result['word_before']}")
        print(f"Word after: {result['word_after']}")
