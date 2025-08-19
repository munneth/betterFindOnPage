import requests
from bs4 import BeautifulSoup
import re

URL = "https://en.wikipedia.org/wiki/Lee_Resolution"

# fetch the content of the url
def getContent(url):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            print(f"Successfully retrieved {url}")
            print(response.text)
            return response.text
        else:
            print(f"Failed to retrieve {url}")
            return None
    except:
        print(f"Failed to retrieve {url}")
        return None

def getLinks(content):
    soup = BeautifulSoup(content, 'html.parser')
    links = []
    for link in soup.find_all('a'):
        links.append(link.get('href'))
    return links

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


content = getContent(URL)
findWord("ought", content)
