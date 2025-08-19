from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import requests
from bs4 import BeautifulSoup
import re
# Add the crawler directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'crawler'))

# Import after adding to path
from crawler import getContent, findWord, crawlAndSearch

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')

@app.route('/')
def home():
    """Home endpoint"""
    return jsonify({
        'message': 'Welcome to the API',
        'status': 'running'
    })

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'flask-api'
    })

@app.route('/api/words', methods=['GET'])
def get_words():
    """Get words endpoint - searches current page only"""
    url = request.args.get('url')
    searchword = request.args.get('searchword')
    content = getContent(url)
    occurrences = findWord(searchword, content)
    return jsonify({
        'url': url,
        'searchword': searchword,
        'occurrences': occurrences,
        'total_occurrences': len(occurrences)
    })

@app.route('/api/words/advanced', methods=['GET'])
def get_words_advanced():
    """Advanced endpoint with crawling - finds the 5 best links most likely to contain the word"""
    url = request.args.get('url')
    searchword = request.args.get('searchword')
    crawl = request.args.get('crawl', 'false').lower() == 'true'
    max_depth = int(request.args.get('max_depth', 1))
    max_links = int(request.args.get('max_links', 5))
    
    # Always search current page first
    content = getContent(url)
    current_page_occurrences = findWord(searchword, content) if content else []
    
    # Add source URL to current page results
    for occurrence in current_page_occurrences:
        occurrence['source_url'] = url
        occurrence['depth'] = 0
    
    all_occurrences = current_page_occurrences.copy()
    crawled_urls = [url] if content else []
    
    # If crawling is enabled, find the best links and crawl them
    if crawl and content:
        print(f"Starting intelligent crawl for '{searchword}' - finding 5 best links")
        crawled_results = crawlAndSearch(url, searchword, max_depth, max_links)
        all_occurrences.extend(crawled_results)
        
        # Get unique crawled URLs
        crawled_urls = list(set([result.get('source_url', url) for result in all_occurrences]))
    
    # Group results by URL for better organization
    results_by_url = {}
    for occurrence in all_occurrences:
        source_url = occurrence.get('source_url', url)
        if source_url not in results_by_url:
            results_by_url[source_url] = []
        results_by_url[source_url].append(occurrence)
    
    return jsonify({
        'url': url,
        'searchword': searchword,
        'occurrences': all_occurrences,
        'total_occurrences': len(all_occurrences),
        'current_page_occurrences': len(current_page_occurrences),
        'crawled_occurrences': len(all_occurrences) - len(current_page_occurrences),
        'crawled_urls': crawled_urls,
        'results_by_url': results_by_url,
        'crawl_settings': {
            'enabled': crawl,
            'max_depth': max_depth,
            'max_links_per_page': max_links
        }
    })

@app.route('/api/crawl', methods=['GET'])
def crawl_endpoint():
    """Dedicated crawl endpoint"""
    url = request.args.get('url')
    searchword = request.args.get('searchword')
    max_depth = int(request.args.get('max_depth', 1))
    max_links = int(request.args.get('max_links', 5))
    
    if not url or not searchword:
        return jsonify({'error': 'URL and searchword are required'}), 400
    
    print(f"Starting intelligent crawl for '{searchword}' on {url}")
    results = crawlAndSearch(url, searchword, max_depth, max_links)
    
    # Group results by URL
    results_by_url = {}
    for result in results:
        source_url = result.get('source_url', url)
        if source_url not in results_by_url:
            results_by_url[source_url] = []
        results_by_url[source_url].append(result)
    
    return jsonify({
        'url': url,
        'searchword': searchword,
        'occurrences': results,
        'total_occurrences': len(results),
        'results_by_url': results_by_url,
        'crawl_settings': {
            'max_depth': max_depth,
            'max_links_per_page': max_links
        }
    })

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Run the app in debug mode for development
    app.run(debug=True, host='0.0.0.0', port=5000)
