from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import requests
from bs4 import BeautifulSoup
import re
from crawler.crawler import getContent, findWord

# Add the crawler directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'crawler'))

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
    """Get words endpoint"""
    url = request.args.get('url')
    searchword = request.args.get('searchword')
    content = getContent(url)
    findWord(searchword, content)
    return jsonify({
        'url': url,
        'searchword': searchword,
        'words': []
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
