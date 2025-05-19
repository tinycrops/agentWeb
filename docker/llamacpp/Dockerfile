FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y git build-essential cmake wget python3 python3-pip \
                       libcurl4-openssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ---- build llama.cpp with CMAKE -------------------------------------------------
WORKDIR /opt
RUN git clone https://github.com/ggerganov/llama.cpp.git
WORKDIR /opt/llama.cpp
RUN mkdir build && cd build && cmake .. && cmake --build . --config Release
RUN cp build/bin/llama-server /opt/llama.cpp/server    # final binary

# ---- tiny 50-line CORS proxy ----------------------------
RUN pip3 install --no-cache-dir flask requests waitress
COPY cors_proxy.py /opt/llama.cpp/cors_proxy.py

# ---- startup script -------------------------------------
COPY start.sh /opt/llama.cpp/start.sh
RUN chmod +x /opt/llama.cpp/start.sh

# CORS proxy port
EXPOSE 8080
# llama.cpp HTTP server port
EXPOSE 7860
ENTRYPOINT ["/opt/llama.cpp/start.sh"] 