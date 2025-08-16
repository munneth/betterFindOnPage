import requests
from bs4 import BeautifulSoup
import pandas as pd

URL = "https://www.google.com"

# fetch the content of the url
def getContent(url):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.text
        else:
            print(f"Failed to retrieve {url}")
            return None
    except:
        print(f"Failed to retrieve {url}")
        return None
