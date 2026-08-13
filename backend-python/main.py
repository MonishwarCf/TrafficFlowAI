import pika
import time
import json
import random
import threading
import os
from dotenv import load_dotenv
from fastapi import FastAPI
import uvicorn
import queue

load_dotenv()

app = FastAPI()

RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'localhost')
EXCHANGE_NAME = os.getenv('EXCHANGE_NAME', 'traffic_exchange')
QUEUE_NAME = os.getenv('QUEUE_NAME', 'traffic_queue')
TOPOLOGY_QUEUE = 'traffic.topology'

nodes = {} # node_id -> {"thread": Thread, "light": "Green", "active": True}
edges = {} # node_id -> set of connected node_ids
nodes_lock = threading.Lock()
publish_queue = queue.Queue()

def node_simulator(node_id):
    print(f"Started simulator for node {node_id}")
    with nodes_lock:
        if node_id in nodes:
            nodes[node_id]["density"] = 0
            nodes[node_id]["incoming"] = 0
            nodes[node_id]["light"] = "Red"
            nodes[node_id]["light_ticks"] = 0

    while True:
        with nodes_lock:
            if node_id not in nodes or not nodes[node_id]["active"]:
                break
            
            current_light = nodes[node_id].get("light", "Red")
            new_light = "Green" if current_light == "Red" else "Red"
            nodes[node_id]["light"] = new_light
            
            density = nodes[node_id].get("density", 0)
            
        message = {
            'node': node_id,
            'density': density,
            'light': new_light,
            'timestamp': time.time()
        }
        
        publish_queue.put(('traffic.' + node_id, message))
        time.sleep(15)

def publisher_thread():
    while True:
        connection = None
        try:
            connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
            channel = connection.channel()
            channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type='topic')
            
            while True:
                routing_key, msg = publish_queue.get()
                channel.basic_publish(
                    exchange=EXCHANGE_NAME,
                    routing_key=routing_key,
                    body=json.dumps(msg)
                )
                # print(f"Sent: {msg}")
        except Exception as e:
            print(f"Publisher error: {e}. Retrying...")
            if connection and not connection.is_closed:
                try:
                    connection.close()
                except Exception:
                    pass
            time.sleep(3)

def process_topology_message(ch, method, properties, body):
    try:
        msg = json.loads(body)
        print(f"Topology update: {msg}")
        msg_type = msg.get("type")
        
        with nodes_lock:
            if msg_type == "add_node":
                node_id = msg.get("id")
                if node_id and node_id not in nodes:
                    nodes[node_id] = {"active": True, "override": None}
                    t = threading.Thread(target=node_simulator, args=(node_id,), daemon=True)
                    t.start()
                    
            elif msg_type == "add_edge":
                src = msg.get("source")
                tgt = msg.get("target")
                if src not in edges: edges[src] = set()
                if tgt not in edges: edges[tgt] = set()
                edges[src].add(tgt)
                edges[tgt].add(src)
                
            elif msg_type == "add_vehicle":
                v_type = msg.get("vehicleType")
                tgt = msg.get("targetNode")
                if v_type == "Ambulance":
                    print(f"AMBULANCE detected heading to {tgt}. Forcing green lights!")
                    # Force target and its neighbors to green
                    targets = set([tgt])
                    if tgt in edges:
                        targets.update(edges[tgt])
                    
                    for t in targets:
                        if t in nodes:
                            nodes[t]["override"] = "Green"
                            nodes[t]["override_time"] = 5 # force green for next 5 ticks
            elif msg_type == "vision_sensor":
                n_id = msg.get("nodeId")
                if n_id in nodes:
                    nodes[n_id]["density"] = msg.get("waitingCars", 0)
            elif msg_type == "proactive_message":
                tgt = msg.get("target")
                if tgt in nodes:
                    nodes[tgt]["incoming"] += msg.get("count", 0)
                    print(f"Node {tgt} received proactive alert: {msg.get('count')} cars incoming from {msg.get('source')}!")
    except Exception as e:
        print(f"Error processing topology msg: {e}")

def topology_listener():
    while True:
        try:
            connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
            channel = connection.channel()
            channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type='topic')
            channel.queue_declare(queue=TOPOLOGY_QUEUE, durable=True)
            channel.queue_bind(exchange=EXCHANGE_NAME, queue=TOPOLOGY_QUEUE, routing_key='topology.#')
            
            channel.basic_consume(queue=TOPOLOGY_QUEUE, on_message_callback=process_topology_message, auto_ack=True)
            print("Listening for topology updates...")
            channel.start_consuming()
        except Exception as e:
            print(f"Topology listener error: {e}. Retrying...")
            time.sleep(3)

@app.on_event("startup")
def startup_event():
    threading.Thread(target=publisher_thread, daemon=True).start()
    threading.Thread(target=topology_listener, daemon=True).start()

@app.get("/")
def read_root():
    return {"message": "Dynamic Edge AI Traffic Simulator Running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
