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
        words = text_content.split()
        for index, word in enumerate(words):
            # If the content contains the search word twice or more this will fire for each occurence
            if word.lower() == searchWord.lower():
                print('Whole content: "{0}"'.format(text_content))
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
                    'position': index
                })
    
    return word_occurrences  # Return the array


content = getContent(URL)
findWord("ought", content)
