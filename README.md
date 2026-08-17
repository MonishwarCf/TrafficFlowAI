# TrafficFlow AI 🚦

TrafficFlow AI is a robust, dynamic edge-AI traffic management simulator. It features a React-based frontend dashboard, a Python AI heuristic engine for routing traffic, a Java WebSocket message broker, and a full computer vision integration for detecting ambulances and estimating real-time vehicle density.

## Prerequisites

1.  **Node.js** (v18+)
2.  **Java JDK 17+**
3.  **Python 3.10+**
4.  **RabbitMQ** (Running via Docker or local installation)

Ensure RabbitMQ is running. If using Docker:
```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

## Installation & Setup

All dependencies for the backend services have been unified. 

### 1. Python Dependencies
Create a virtual environment at the root of the project and install all required Python libraries (including TensorFlow, OpenCV, FastAPI, and Flask):
```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

## Running the Application

To launch all 4 services (React UI, Java Broker, Python Backend, and the Computer Vision MJPEG Streamer), simply run the included `start_all.bat` script from the root directory.

```bash
.\start_all.bat
```

This will automatically spawn:
*   **Frontend Dashboard:** `http://localhost:4173` (or `5173`)
*   **Java WebSocket API:** `http://localhost:8080`
*   **Python AI Controller:** `http://localhost:8001`
*   **CV Video Feed Streamer:** `http://localhost:5001/video_feed`

### Usage

1. Open your browser and navigate to `http://localhost:4173`.
2. Click **Go to Sandbox** to build your traffic node network. Connect nodes using standard edges.
3. Once built, click the **Play** button in the top left toolbar to enable the `sim_running` loop.
4. Go to **Debug & Logs** to monitor live CV bounding boxes and the proactive AI heuristic clear-out decisions.
