from flask import Flask, request, Response
import requests, os

LLAMA = os.getenv("LLAMA_HOST", "http://localhost:7860")
app = Flask(__name__)

@app.after_request
def add_cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    r.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return r

@app.route("/<path:p>", methods=["POST","OPTIONS"])
def proxy(p):
    if request.method == "OPTIONS":
        return ("",200)
    resp = requests.post(f"{LLAMA}/{p}", json=request.get_json())
    return Response(resp.content, resp.status_code, mimetype="application/json")

if __name__ == "__main__":
    print("* CORS proxy ready on :8080 →", LLAMA)
    app.run(host="0.0.0.0", port=8080) 