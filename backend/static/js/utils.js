// Utility functions for JSONL editor

function parseJSONL(content) {
    try {
        const lines = content.trim().split('\n');
        return lines.map(line => {
            const parsed = JSON.parse(line);
            if (parsed.messages) {
                return parsed;
            } else if (parsed.conversations) {
                return {
                    messages: parsed.conversations.map(conv => ({
                        role: conv.from || conv.role,
                        content: conv.value || conv.content
                    }))
                };
            }
            throw new Error('Invalid message format');
        });
    } catch (error) {
        throw new Error(`Error parsing JSONL: ${error.message}`);
    }
}

function parseJSON(content) {
    try {
        const parsed = JSON.parse(content);
        if (parsed.messages) {
            return [parsed];
        } else if (parsed.conversations) {
            return [{
                messages: parsed.conversations.map(conv => ({
                    role: conv.from || conv.role,
                    content: conv.value || conv.content
                }))
            }];
        }
        throw new Error('Invalid JSON structure');
    } catch (error) {
        throw new Error(`Error parsing JSON: ${error.message}`);
    }
}

function exportJSONL(content) {
    return content.map(item => JSON.stringify(item)).join('\n');
}

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
