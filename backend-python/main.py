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

    cars_passed_this_green = 0

    while True:
        with nodes_lock:
            if node_id not in nodes or not nodes[node_id]["active"]:
                break
            
            density = nodes[node_id].get("density", 0)
            incoming = nodes[node_id].get("incoming", 0)
            current_light = nodes[node_id].get("light", "Red")
            ticks = nodes[node_id].get("light_ticks", 0)
            
            new_light = current_light
            
            if nodes[node_id].get("override") == "Green":
                new_light = "Green"
                nodes[node_id]["override_time"] -= 1
                if nodes[node_id]["override_time"] <= 0:
                    nodes[node_id]["override"] = None
            else:
                if incoming > 0:
                    new_light = "Green"
                elif density > 10:
                    new_light = "Green"
                elif density == 0 and incoming == 0 and ticks > 5 and current_light == "Green":
                    new_light = "Red"
                elif ticks > 10:
                    new_light = "Red" if current_light == "Green" else "Green"

            if new_light != current_light:
                if new_light == "Red" and current_light == "Green" and cars_passed_this_green > 0:
                    downstream = edges.get(node_id, set())
                    if downstream:
                        target = list(downstream)[0]
                        proactive_msg = {
                            "type": "proactive_message",
                            "source": node_id,
                            "target": target,
                            "count": cars_passed_this_green
                        }
                        publish_queue.put(('topology.proactive', proactive_msg))
                        print(f"AI Node {node_id} proactive msg: Sending {cars_passed_this_green} cars to {target}")
                    cars_passed_this_green = 0
                
                nodes[node_id]["light"] = new_light
                nodes[node_id]["light_ticks"] = 0
            else:
                nodes[node_id]["light_ticks"] += 1
                
            current_light = nodes[node_id]["light"]
            
            if current_light == "Green":
                passed = min(density, 5) if density > 0 else (min(incoming, 5) if incoming > 0 else 0)
                cars_passed_this_green += passed
                
                if incoming > 0:
                    nodes[node_id]["incoming"] = max(0, incoming - 5)
            
        message = {
            'node': node_id,
            'density': density,
            'light': current_light,
            'timestamp': time.time()
        }
        
        publish_queue.put(('traffic.' + node_id, message))
        time.sleep(2)

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
