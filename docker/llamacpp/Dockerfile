FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
RUN  apt-get update && \
     apt-get install -y git build-essential cmake wget libcurl4-openssl-dev ca-certificates && \
     rm -rf /var/lib/apt/lists/*

# ---- build llama.cpp with CMAKE -------------------------------------------------
WORKDIR /opt
RUN git clone https://github.com/ggerganov/llama.cpp.git
WORKDIR /opt/llama.cpp
# Use CMake build instead of Makefile
RUN mkdir build && cd build && \
    cmake .. && \
    cmake --build . --config Release && \
    cp bin/llama-server /opt/llama.cpp/server

# ---- download model --------------------------------------------------
WORKDIR /model

# Create a cors proxy script
RUN echo '#!/usr/bin/env python3' > /opt/llama.cpp/cors_proxy.py && \
    echo 'import http.server' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'import socketserver' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'import urllib.request' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'import json' >> /opt/llama.cpp/cors_proxy.py && \
    echo '' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'PORT = 8080' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'LLAMA_SERVER = "http://localhost:7860"' >> /opt/llama.cpp/cors_proxy.py && \
    echo '' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):' >> /opt/llama.cpp/cors_proxy.py && \
    echo '    def end_headers(self):' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        self.send_header("Access-Control-Allow-Origin", "*")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        self.send_header("Access-Control-Allow-Headers", "Content-Type")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        super().end_headers()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '' >> /opt/llama.cpp/cors_proxy.py && \
    echo '    def do_OPTIONS(self):' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        self.send_response(200)' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        self.end_headers()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '' >> /opt/llama.cpp/cors_proxy.py && \
    echo '    def do_POST(self):' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        content_length = int(self.headers["Content-Length"])' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        post_data = self.rfile.read(content_length)' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        print(f"Received request for {self.path}")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        print(f"Request data: {post_data}")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        # Forward the request to llama.cpp server' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        req = urllib.request.Request(f"{LLAMA_SERVER}{self.path}", data=post_data, headers={"Content-Type": "application/json"})' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        try:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            with urllib.request.urlopen(req) as response:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                response_data = response.read()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                self.send_response(response.status)' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                self.send_header("Content-type", "application/json")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                self.end_headers()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                self.wfile.write(response_data)' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        except urllib.error.HTTPError as e:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            print(f"HTTP Error: {e.code} - {e.reason}")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            try:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                error_content = e.read()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                print(f"Error content: {error_content}")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            except Exception as read_err:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '                print(f"Cannot read error content: {read_err}")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.send_response(e.code)' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.send_header("Content-type", "application/json")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.end_headers()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            error_message = {"error": f"Error forwarding request: {str(e)}"}' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.wfile.write(json.dumps(error_message).encode())' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        except Exception as e:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            print(f"General Error: {type(e)} - {str(e)}")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.send_response(500)' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.send_header("Content-type", "application/json")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.end_headers()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            error_message = {"error": f"Internal server error: {str(e)}"}' >> /opt/llama.cpp/cors_proxy.py && \
    echo '            self.wfile.write(json.dumps(error_message).encode())' >> /opt/llama.cpp/cors_proxy.py && \
    echo '' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'print(f"Starting CORS proxy server on port {PORT}")' >> /opt/llama.cpp/cors_proxy.py && \
    echo 'with socketserver.TCPServer(("", PORT), CORSHTTPRequestHandler) as httpd:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '    try:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        print("CORS proxy is ready to serve requests")' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        httpd.serve_forever()' >> /opt/llama.cpp/cors_proxy.py && \
    echo '    except KeyboardInterrupt:' >> /opt/llama.cpp/cors_proxy.py && \
    echo '        print("Server stopped")' >> /opt/llama.cpp/cors_proxy.py && \
    chmod +x /opt/llama.cpp/cors_proxy.py

# Install dependencies for huggingface-cli
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install huggingface_hub && \
    rm -rf /var/lib/apt/lists/*

# Create a script to download the model and start the server
RUN echo '#!/bin/bash' > /opt/llama.cpp/download-model.sh && \
    echo 'echo "Downloading SmolVLM model using huggingface-cli..."' >> /opt/llama.cpp/download-model.sh && \
    echo 'cd /opt/llama.cpp && ./server -m /model/model.gguf -hf ggml-org/SmolVLM-500M-Instruct-GGUF &' >> /opt/llama.cpp/download-model.sh && \
    echo 'SERVER_PID=$!' >> /opt/llama.cpp/download-model.sh && \
    echo 'sleep 5' >> /opt/llama.cpp/download-model.sh && \
    echo 'kill $SERVER_PID' >> /opt/llama.cpp/download-model.sh && \
    echo 'echo "Starting llama.cpp server with CORS proxy"' >> /opt/llama.cpp/download-model.sh && \
    echo 'python3 /opt/llama.cpp/cors_proxy.py &' >> /opt/llama.cpp/download-model.sh && \
    echo 'exec /opt/llama.cpp/server -m /model/model.gguf --host 0.0.0.0 --port 7860 -ngl 99' >> /opt/llama.cpp/download-model.sh && \
    chmod +x /opt/llama.cpp/download-model.sh

EXPOSE 8080
EXPOSE 7860
ENTRYPOINT ["/opt/llama.cpp/download-model.sh"] 