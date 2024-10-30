from flask import Flask, render_template, request, jsonify
import requests
import logging

app = Flask(__name__)
app.logger.setLevel(logging.INFO)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    try:
        messages = data.get('messages', [])
        config = data.get('config', {})
        
        if not config.get('api_key'):
            return jsonify({'error': 'API key is required'}), 400
            
        if config.get('provider') == 'azure':
            url = f"{config['endpoint']}/openai/deployments/{config['deployment_name']}/chat/completions?api-version={config['api_version']}"
            headers = {
                'Content-Type': 'application/json',
                'api-key': config['api_key']
            }
        else:  # OpenAI
            url = 'https://api.openai.com/v1/chat/completions'
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {config['api_key']}"
            }
            
        body = {
            'messages': messages,
            'model': config.get('model', 'gpt-3.5-turbo'),
            'temperature': config.get('temperature', 0.7),
            'max_tokens': config.get('max_tokens', 150),
            'stream': config.get('stream', False)
        }
        if config.get('kwargs'):
            body.update(config['kwargs'])
            
        response = requests.post(url, json=body, headers=headers)
        if not response.ok:
            error_data = response.json()
            return jsonify({
                'error': f"API Error ({response.status_code}): {error_data.get('error', {}).get('message', 'Unknown error')}"
            }), response.status_code
            
        return response.json()
    except Exception as e:
        app.logger.error(f"Chat API error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
