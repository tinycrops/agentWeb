import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

/**
 * Chatbot component with file upload functionality
 */
function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState('web-user');
  const [uploading, setUploading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    newSocket.on('update', (data) => {
      if (data.kind === 'insightAdded' || data.kind === 'narrativeAdded') {
        addMessage('System', data.data.message || data.data.text);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Scroll to the bottom of the messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Add a message to the chat
  const addMessage = (sender, text) => {
    setMessages(prev => [...prev, { sender, text, timestamp: new Date() }]);
  };

  // Handle text message submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add message to chat
    addMessage('You', input);

    try {
      // Send to chat endpoint
      await axios.post(`${API_URL}/api/ingestion/chat`, {
        userId,
        channelId: 'web-chat',
        text: input
      });
    } catch (error) {
      console.error('Error sending message:', error);
      addMessage('System', 'Failed to send message. Please try again.');
    }

    // Clear input
    setInput('');
  };

  // Handle file selection
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    addMessage('System', `Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', userId);

      const response = await axios.post(`${API_URL}/api/ingestion/upload`, formData);

      if (response.status === 202) {
        addMessage('System', `Document uploaded successfully! (${file.name})`);
      } else {
        addMessage('System', 'Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      addMessage('System', 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Trigger file selection dialog
  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="chatbot-container">
      <div className="chatbot-header">
        <h2>AgentWeb Chatbot</h2>
        <div className="connection-status">
          <span className={connected ? 'connected' : 'disconnected'}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
      
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Send a message or upload a document to get started.</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message ${msg.sender.toLowerCase()}`}>
              <div className="message-header">
                <span className="sender">{msg.sender}</span>
                <span className="timestamp">
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="message-text">{msg.text}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="input-container">
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={uploading}
          />
          <button type="submit" disabled={!input.trim() || uploading}>
            Send
          </button>
        </form>
        
        <div className="upload-container">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept=".txt,.md,.pdf"
            style={{ display: 'none' }}
          />
          <button
            onClick={handleFileUploadClick}
            disabled={uploading}
            className="upload-button"
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </div>
      
      <div className="user-container">
        <label htmlFor="userId">User ID:</label>
        <input
          type="text"
          id="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Enter your user ID"
        />
      </div>
    </div>
  );
}

export default Chatbot; 