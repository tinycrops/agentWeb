# SmolVLM Integration with AgentWeb

This document explains how the tinycrops-smolvlm-realtime-webcam demo has been integrated into AgentWeb.

## Components Added

1. **Docker Service for llamacpp**
   - Located in `docker/llamacpp/`
   - Runs SmolVLM-500M-Instruct model via llama.cpp server
   - Exposes the model on port 8080

2. **Camera Web Interface**
   - Located in `src/frontend/public/camera/`
   - Accessible at http://localhost:4000/camera
   - Sends camera frames to SmolVLM and publishes results to AgentWeb

3. **Backend Integration**
   - Added `/camera` route in express to serve the camera interface
   - Added VisionObservation event type
   - Added `/api/ingestion/vision` endpoint (optional)

## How It Works

1. The camera webpage captures frames from your webcam
2. Each frame is sent to the SmolVLM model running in the llamacpp service
3. SmolVLM analyzes the frame and returns a text description
4. The description is sent to AgentWeb via the `/api/ingestion/chat` API
5. The event appears in the normal AgentWeb event stream

## Usage

1. Start all services:
   ```
   docker-compose up --build
   ```

2. Navigate to:
   - http://localhost:4000/camera - for the camera interface
   - http://localhost:3001 - for the AgentWeb dashboard

3. In the camera interface:
   - Click "Start" to begin capturing and analyzing frames
   - View the model's responses in the AgentWeb dashboard (select "webcam" channel)

## Future Enhancements

- **Customizable Models**: Swap the SmolVLM model for other compatible models
- **Backend Integration**: Move image processing to the backend for more efficiency
- **Structured Output**: Parse JSON responses for more structured data processing
- **Event Types**: Add custom event types and agents to process vision data 