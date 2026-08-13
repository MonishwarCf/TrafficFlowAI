import pika
import time
import json
import random
import threading
import os
from dotenv import load_dotenv
from fastapi import FastAPI
import uvicorn

load_dotenv()

app = FastAPI()

RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'localhost')
EXCHANGE_NAME = os.getenv('EXCHANGE_NAME', 'traffic_exchange')
QUEUE_NAME = os.getenv('QUEUE_NAME', 'traffic_queue')

def simulate_traffic():
    while True:
        connection = None
        try:
            connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
            channel = connection.channel()
            
            channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type='topic')
            
            nodes = ['Node_A', 'Node_B', 'Node_C', 'Node_D']
            
            while True:
                node = random.choice(nodes)
                density = random.randint(0, 100)
                status = 'Normal'
                if density > 80:
                    status = 'Congested'
                elif density > 50:
                    status = 'Heavy'
                    
                message = {
                    'node': node,
                    'density': density,
                    'status': status,
                    'timestamp': time.time()
                }
                
                routing_key = f"traffic.{node}"
                channel.basic_publish(
                    exchange=EXCHANGE_NAME,
                    routing_key=routing_key,
                    body=json.dumps(message)
                )
                print(f"Sent: {message}")
                # Use connection.sleep instead of time.sleep to avoid blocking heartbeats
                connection.sleep(2)
        except Exception as e:
            print(f"Connection error: {e}. Retrying in 5 seconds...")
            if connection and not connection.is_closed:
                try:
                    connection.close()
                except Exception as ce:
                    print(f"Error closing connection: {ce}")
            time.sleep(5)

@app.on_event("startup")
def startup_event():
    thread = threading.Thread(target=simulate_traffic, daemon=True)
    thread.start()

@app.get("/")
def read_root():
    return {"message": "Edge AI Traffic Simulator Running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
