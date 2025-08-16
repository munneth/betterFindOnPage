from flask import Flask, request, jsonify
from flask_cors import CORS
import os

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

@app.route('/api/links', methods=['GET'])
def get_links():
    """Get links endpoint"""
    return jsonify({
        'links': [],
        'count': 0
    })

@app.route('/api/links', methods=['POST'])
def add_links():
    """Add links endpoint"""
    data = request.get_json()
    
    if not data or 'links' not in data:
        return jsonify({'error': 'No links provided'}), 400
    
    # Process the links here
    links = data['links']
    
    return jsonify({
        'message': f'Processed {len(links)} links',
        'links': links
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
