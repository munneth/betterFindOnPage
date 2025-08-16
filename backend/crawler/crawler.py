import requests
from bs4 import BeautifulSoup

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
    
getContent(URL)
