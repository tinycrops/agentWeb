import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import Chatbot from './components/Chatbot';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function App() {
  const [projects, setProjects] = useState([]);
  const [narratives, setNarratives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'chatbot'

  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      newSocket.emit('subscribe'); // Subscribe to all updates
    });

    newSocket.on('update', (data) => {
      console.log('Received update:', data);
      // Refresh data on updates
      fetchData();
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projectsResponse, narrativesResponse] = await Promise.all([
        axios.get(`${API_URL}/api/projects`),
        axios.get(`${API_URL}/api/narratives`)
      ]);

      setProjects(projectsResponse.data);
      setNarratives(narrativesResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header>
        <h1>AgentWeb Dashboard</h1>
        <nav>
          <button 
            className={activeTab === 'dashboard' ? 'active' : ''} 
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={activeTab === 'chatbot' ? 'active' : ''} 
            onClick={() => setActiveTab('chatbot')}
          >
            Chatbot
          </button>
        </nav>
      </header>
      
      <main>
        {activeTab === 'dashboard' ? (
          loading ? (
            <p>Loading data...</p>
          ) : (
            <div className="dashboard">
              <section className="projects">
                <h2>Projects</h2>
                {projects.length === 0 ? (
                  <p>No projects yet. Try simulating some events!</p>
                ) : (
                  <ul>
                    {projects.map(project => (
                      <li key={project.projectId}>
                        <strong>{project.projectId}</strong>: {project.progress}% complete
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="narratives">
                <h2>System Narratives</h2>
                {narratives.length === 0 ? (
                  <p>No narratives generated yet.</p>
                ) : (
                  <ul>
                    {narratives.map(narrative => (
                      <li key={narrative.narrativeId}>
                        <pre>{narrative.text}</pre>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )
        ) : (
          <Chatbot />
        )}
      </main>
    </div>
  );
}

export default App; 