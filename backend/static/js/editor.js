const JSONLEditor = {
  state: {
      parsedContent: [],
      filters: {
          system: true,
          user: true,
          assistant: true
      },
      customRoles: new Set(),
      fontSize: 14,
      hiddenItems: new Set(),
      hideFirstMessage: false,
      showLatestMessage: false,
      originalMessages: null
  },

  init() {
      // Initialize state first
      this.state = {
          parsedContent: [],
          filters: {
              system: true,
              user: true,
              assistant: true
          },
          customRoles: new Set(),
          fontSize: 14,
          hiddenItems: new Set(),
          hideFirstMessage: false,
          showLatestMessage: false,
          originalMessages: null
      };

      // Bind methods individually 
      this.loadSampleData = this.loadSampleData.bind(this);
      this.handleParse = this.handleParse.bind(this);
      this.renderContent = this.renderContent.bind(this);
      this.handleExport = this.handleExport.bind(this);
      this.handleMoveMessage = this.handleMoveMessage.bind(this);
      this.handleDeleteMessage = this.handleDeleteMessage.bind(this);
      this.handleEditMessage = this.handleEditMessage.bind(this);
      this.handleEditRole = this.handleEditRole.bind(this);
      this.handleAddMessage = this.handleAddMessage.bind(this);
      this.handleToggleHidden = this.handleToggleHidden.bind(this);
      this.handleToggleAllItems = this.handleToggleAllItems.bind(this);
      this.updateFontSize = this.updateFontSize.bind(this);
      this.handlePlayground = this.handlePlayground.bind(this);
      this.showError = this.showError.bind(this);
      this.updateRoleFilters = this.updateRoleFilters.bind(this);
      this.handleCopyItem = this.handleCopyItem.bind(this);

      // Set initial theme
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      const themeToggle = document.getElementById('themeToggle');
      if (themeToggle) {
          themeToggle.innerHTML = getIcon('sun');
      }

      this.bindEvents();
      this.updateFontSize(this.state.fontSize);
  },

  bindEvents() {
      const jsonInput = document.getElementById('jsonInput');
      const parseBtn = document.getElementById('parseBtn');
      const sampleBtn = document.getElementById('sampleBtn');
      const exportBtn = document.getElementById('exportBtn');
      const themeToggle = document.getElementById('themeToggle');
      const searchInput = document.getElementById('searchInput');
      const fontSizeInput = document.getElementById('fontSize');
      const hideFirstMsgCheckbox = document.getElementById('hideFirstMsg');
      const showLatestMsgCheckbox = document.getElementById('showLatestMsg');

      if (fontSizeInput) {
          fontSizeInput.value = this.state.fontSize;
          fontSizeInput.addEventListener('change', (e) => {
              const newSize = parseInt(e.target.value);
              if (newSize >= 8 && newSize <= 32) {
                  this.updateFontSize(newSize);
              }
          });
      }

      if (hideFirstMsgCheckbox) {
          hideFirstMsgCheckbox.addEventListener('change', (e) => {
              this.state.hideFirstMessage = e.target.checked;
              this.renderContent();
          });
      }

      if (showLatestMsgCheckbox) {
          showLatestMsgCheckbox.addEventListener('change', (e) => {
              this.state.showLatestMessage = e.target.checked;
              if (e.target.checked) {
                  if (!this.state.originalMessages) {
                      this.state.originalMessages = this.state.parsedContent.map(item => ({
                          messages: Array.prototype.slice.call(item.messages)
                      }));
                  }
                  this.state.parsedContent.forEach(item => {
                      const messages = item.messages;
                      while (messages.length > 1) {
                          messages.shift();
                      }
                  });
              } else {
                  if (this.state.originalMessages) {
                      this.state.parsedContent = this.state.originalMessages.map(item => ({
                          messages: Array.prototype.slice.call(item.messages)
                      }));
                      this.state.originalMessages = null;
                  }
              }
              this.renderContent();
          });
      }

      if (themeToggle) {
          themeToggle.addEventListener('click', () => {
              const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
              document.documentElement.setAttribute('data-bs-theme', isDarkMode ? 'light' : 'dark');
              themeToggle.innerHTML = getIcon(isDarkMode ? 'moon' : 'sun');
          });
      }

      if (parseBtn) parseBtn.addEventListener('click', this.handleParse);
      if (sampleBtn) sampleBtn.addEventListener('click', this.loadSampleData);
      if (searchInput) searchInput.addEventListener('input', () => this.renderContent());
      if (exportBtn) exportBtn.addEventListener('click', this.handleExport);

      document.querySelectorAll('.form-check-input').forEach(checkbox => {
          if (checkbox.id === 'hideFirstMsg' || checkbox.id === 'showLatestMsg') return;
          checkbox.addEventListener('change', () => {
              this.state.filters[checkbox.id.replace('filter', '').toLowerCase()] = checkbox.checked;
              this.renderContent();
          });
      });
  },

  loadSampleData() {
      const sampleData = `{"messages":[{"role":"system","content":"Assistant is helpful and friendly."},{"role":"user","content":"Hello!"},{"role":"assistant","content":"Hi! How can I help you today?"}]}
{"messages":[{"role":"user","content":"What's the weather like?"},{"role":"assistant","content":"I don't have access to real-time weather information. You would need to check a weather service or app for that information."}]}`;
      
      const jsonInput = document.getElementById('jsonInput');
      if (jsonInput) {
          jsonInput.value = sampleData;
          this.handleParse();
      }
  },

  parseJSONL(content) {
      try {
          return content.trim().split('\n').map(line => {
              const item = JSON.parse(line);
              return this.normalizeItem(item);
          });
      } catch (error) {
          throw new Error(`Error parsing JSONL: ${error.message}`);
      }
  },

  parseJSON(content) {
      try {
          const parsed = JSON.parse(content);
          return [this.normalizeItem(parsed)];
      } catch (error) {
          throw new Error(`Error parsing JSON: ${error.message}`);
      }
  },

  normalizeItem(item) {
      if (!item) throw new Error("Invalid item: null or undefined");
      
      if (item.conversations) {
          return {
              messages: item.conversations.map(conv => {
                  if (!conv) throw new Error("Invalid conversation item");
                  return {
                      role: conv.from || conv.role || 'user',
                      content: conv.value || conv.content || ''
                  };
              })
          };
      } else if (item.messages) {
          return {
              messages: item.messages.map(msg => {
                  if (!msg) throw new Error("Invalid message item");
                  return {
                      role: msg.role || msg.from || 'user',
                      content: msg.content || msg.value || ''
                  };
              })
          };
      }
      throw new Error("Invalid structure: missing conversations or messages");
  },

  handleParse() {
      const jsonInput = document.getElementById('jsonInput');
      if (!jsonInput) return;

      const content = jsonInput.value.trim();
      const errorContainer = document.getElementById('errorContainer');
      
      if (errorContainer) errorContainer.classList.add('d-none');
      
      if (!content) {
          this.showError('Please enter some content to parse.');
          return;
      }
      
      try {
          this.state.parsedContent = content.includes('\n') ? 
              this.parseJSONL(content) : 
              this.parseJSON(content);

          this.state.parsedContent.forEach(item => {
              item.messages.forEach(msg => {
                  if (!this.state.filters.hasOwnProperty(msg.role)) {
                      this.state.filters[msg.role] = true;
                      this.state.customRoles.add(msg.role);
                  }
              });
          });
          
          this.renderContent();
          this.updateRoleFilters();
      } catch (error) {
          this.showError(error.message);
      }
  },

  handleCopyItem(itemIndex) {
      const item = this.state.parsedContent[itemIndex];
      if (!item) return;

      const jsonl = JSON.stringify({messages: item.messages})
          .replace(/\"/g, '"')
          .replace(/^"|"$/g, '');

      navigator.clipboard.writeText(jsonl).then(() => {
          const copyBtn = document.querySelector(`[data-item="${itemIndex}"] .btn-copy`);
          if (copyBtn) {
              copyBtn.innerHTML = getIcon('check');
              setTimeout(() => copyBtn.innerHTML = getIcon('copy'), 1000);
          }
      }).catch(err => console.error('Copy failed:', err));
  },

  renderContent() {
      const parsedContentContainer = document.getElementById('parsedContent');
      if (!parsedContentContainer) return;

      const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
      parsedContentContainer.innerHTML = '';

      this.state.parsedContent.forEach((item, itemIndex) => {
          const itemContainer = document.createElement('div');
          itemContainer.className = 'message-item mb-3';
          itemContainer.dataset.itemIndex = itemIndex;
          itemContainer.dataset.item = itemIndex;

          const header = document.createElement('div');
          header.className = 'item-header d-flex justify-content-between align-items-center mb-2';
          header.innerHTML = `
              <h5 class="mb-0">Item ${itemIndex + 1}</h5>
              <div class="d-flex gap-2">
                  <button class="btn btn-sm btn-outline-secondary btn-copy" onclick="JSONLEditor.handleCopyItem(${itemIndex})">
                      ${getIcon('copy')}
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" onclick="JSONLEditor.handleToggleHidden(${itemIndex})">
                      ${getIcon(this.state.hiddenItems.has(itemIndex) ? 'eye' : 'eyeOff')}
                  </button>
                  <button class="btn btn-sm btn-outline-primary" onclick="JSONLEditor.handlePlayground(${itemIndex})">
                      ${getIcon('play')}
                  </button>
              </div>
          `;

          itemContainer.appendChild(header);

          if (!this.state.hiddenItems.has(itemIndex)) {
              item.messages.forEach((msg, msgIndex) => {
                  if (this.shouldRenderMessage(msg, msgIndex, searchTerm)) {
                      const messageDiv = document.createElement('div');
                      messageDiv.className = 'message-content mb-3';
                      messageDiv.dataset.msgIndex = msgIndex;

                      const messageHeader = document.createElement('div');
                      messageHeader.className = 'message-header';
                      messageHeader.innerHTML = `
                          <input type="text" class="form-control form-control-sm d-inline-block w-auto"
                                 value="${msg.role}"
                                 onchange="JSONLEditor.handleEditRole(${itemIndex}, ${msgIndex}, this.value)">
                          <div class="message-actions">
                              <button class="btn btn-sm" onclick="JSONLEditor.handleMoveMessage(${itemIndex}, ${msgIndex}, 'up')"
                                      ${msgIndex === 0 ? 'disabled' : ''}>
                                  ${getIcon('chevronUp')}
                              </button>
                              <button class="btn btn-sm" onclick="JSONLEditor.handleMoveMessage(${itemIndex}, ${msgIndex}, 'down')"
                                      ${msgIndex === item.messages.length - 1 ? 'disabled' : ''}>
                                  ${getIcon('chevronDown')}
                              </button>
                              <button class="btn btn-sm" onclick="JSONLEditor.handleDeleteMessage(${itemIndex}, ${msgIndex})">
                                  ${getIcon('trash')}
                              </button>
                          </div>
                      `;

                      const textarea = document.createElement('textarea');
                      textarea.className = 'form-control mt-2';
                      textarea.value = msg.content;
                      textarea.oninput = (e) => {
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                          this.handleEditMessage(itemIndex, msgIndex, e.target.value);
                      };

                      messageDiv.appendChild(messageHeader);
                      messageDiv.appendChild(textarea);
                      itemContainer.appendChild(messageDiv);
                  }
              });

              const addButton = document.createElement('button');
              addButton.className = 'btn btn-sm btn-secondary mt-2';
              addButton.innerHTML = `${getIcon('plus')} Add Message`;
              addButton.onclick = () => this.handleAddMessage(itemIndex);

              itemContainer.appendChild(addButton);
          }
          
          parsedContentContainer.appendChild(itemContainer);
      });
  },

  shouldRenderMessage(msg, msgIndex, searchTerm) {
      if (!msg || !msg.role) return false;
      if (this.state.hideFirstMessage && msgIndex === 0) return false;
      return this.state.filters[msg.role] && 
             (!searchTerm || msg.content.toLowerCase().includes(searchTerm));
  },

  updateRoleFilters() {
      const filtersContainer = document.querySelector('.filters .d-flex');
      if (!filtersContainer) return;

      Array.prototype.slice.call(filtersContainer.children).forEach(child => {
          const input = child.querySelector('input');
          if (input && input.id.startsWith('filter') && 
              !['filterSystem', 'filterUser', 'filterAssistant'].includes(input.id)) {
              child.remove();
          }
      });

      const searchContainer = filtersContainer.querySelector('.ms-auto');
      this.state.customRoles.forEach(role => {
          if (!['system', 'user', 'assistant'].includes(role.toLowerCase())) {
              const div = document.createElement('div');
              div.className = 'form-check';
              div.innerHTML = `
                  <input type="checkbox" class="form-check-input" id="filter${role}" checked>
                  <label class="form-check-label" for="filter${role}">${role}</label>
              `;
              
              const checkbox = div.querySelector('input');
              checkbox.addEventListener('change', () => {
                  this.state.filters[role.toLowerCase()] = checkbox.checked;
                  this.renderContent();
              });

              filtersContainer.insertBefore(div, searchContainer);
          }
      });
  },

  handleMoveMessage(itemIndex, msgIndex, direction) {
      const newIndex = direction === 'up' ? msgIndex - 1 : msgIndex + 1;
      if (newIndex >= 0 && newIndex < this.state.parsedContent[itemIndex].messages.length) {
          const messages = this.state.parsedContent[itemIndex].messages;
          const temp = messages[msgIndex];
          messages[msgIndex] = messages[newIndex];
          messages[newIndex] = temp;
          this.renderContent();
      }
  },

  handleDeleteMessage(itemIndex, msgIndex) {
      this.state.parsedContent[itemIndex].messages.splice(msgIndex, 1);
      if (this.state.parsedContent[itemIndex].messages.length === 0) {
          this.state.parsedContent.splice(itemIndex, 1);
      }
      this.renderContent();
  },

  handleEditMessage(itemIndex, msgIndex, content) {
      this.state.parsedContent[itemIndex].messages[msgIndex].content = content;
  },

  handleEditRole(itemIndex, msgIndex, role) {
      this.state.parsedContent[itemIndex].messages[msgIndex].role = role;
      if (!this.state.filters.hasOwnProperty(role)) {
          this.state.filters[role] = true;
          this.state.customRoles.add(role);
          this.updateRoleFilters();
      }
      this.renderContent();
  },

  handleAddMessage(itemIndex) {
      const messages = this.state.parsedContent[itemIndex].messages;
      const lastMessage = messages[messages.length - 1];
      const newRole = lastMessage?.role === 'user' ? 'assistant' : 'user';
      messages.push({ role: newRole, content: '' });
      this.renderContent();
  },

  handleToggleHidden(itemIndex) {
      if (this.state.hiddenItems.has(itemIndex)) {
          this.state.hiddenItems.delete(itemIndex);
      } else {
          this.state.hiddenItems.add(itemIndex);
      }
      
      const itemContainer = document.querySelector(`[data-item="${itemIndex}"]`);
      if (itemContainer) {
          const messageContent = itemContainer.querySelectorAll('.message-content, .btn-secondary');
          messageContent.forEach(el => {
              el.style.display = this.state.hiddenItems.has(itemIndex) ? 'none' : 'block';
          });
          
          const eyeBtn = itemContainer.querySelector('.btn-outline-secondary:nth-child(2)');
          if (eyeBtn) {
              eyeBtn.innerHTML = getIcon(this.state.hiddenItems.has(itemIndex) ? 'eye' : 'eyeOff');
          }
      }
  },

  handleToggleAllItems() {
      const allVisible = this.state.parsedContent.every((_, index) => 
          !this.state.hiddenItems.has(index)
      );

      if (allVisible) {
          this.state.parsedContent.forEach((_, index) => 
              this.state.hiddenItems.add(index)
          );
      } else {
          this.state.hiddenItems.clear();
      }
      this.renderContent();
  },

  updateFontSize(size) {
      this.state.fontSize = size;
      document.body.style.fontSize = `${size}px`;
      document.querySelectorAll('textarea').forEach(textarea => {
          textarea.style.fontSize = `${size}px`;
      });
      document.querySelectorAll('.btn, .form-control, .message-header').forEach(el => {
          el.style.fontSize = `${Math.max(size * 0.9, 12)}px`;
      });
  },
  handlePlayground(itemIndex) {
    const item = this.state.parsedContent[itemIndex];
    if (!item) return;

    // Encode JSONL messages to a URL-friendly format
    const jsonlData = encodeURIComponent(JSON.stringify(item.messages));
    
    // Open the Vite playground app (assuming it's on the /playground route)
    console.log('Opening playground...');
    // window.open('http://127.0.0.1:5173/playground', '_blank');
    // Modify the URL to include the referrer as a parameter
    const playgroundUrl = `http://127.0.0.1:5173/playground?jsonlData=${jsonlData}&referrer=${encodeURIComponent(window.location.href)}`;
    window.open(playgroundUrl, '_blank');
    // window.open('/playground', '_blank');


},


  showError(message) {
      const errorContainer = document.getElementById('errorContainer');
      if (errorContainer) {
          errorContainer.textContent = message;
          errorContainer.classList.remove('d-none');
      }
  },

  handleExport() {
      try {
          const jsonlContent = this.state.parsedContent
              .map(item => JSON.stringify(item))
              .join('\n');
              
          const exportContentElement = document.getElementById('exportContent');
          if (exportContentElement) {
              exportContentElement.value = jsonlContent;
              const exportModal = new bootstrap.Modal(document.getElementById('exportModal'));
              exportModal.show();
          }
      } catch (error) {
          this.showError(error.message);
      }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  JSONLEditor.init();
});

window.JSONLEditor = JSONLEditor;