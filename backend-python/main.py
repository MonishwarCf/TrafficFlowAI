import pika
import time
import json
import random
import threading
import os
from dotenv import load_dotenv
from traffic_signal import TrafficSignal
from fastapi import FastAPI
import uvicorn
import queue

load_dotenv()

app = FastAPI()

RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'localhost')
EXCHANGE_NAME = os.getenv('EXCHANGE_NAME', 'traffic_exchange')
QUEUE_NAME = os.getenv('QUEUE_NAME', 'traffic_queue')
TOPOLOGY_QUEUE = 'traffic.topology'

nodes = {} # node_id -> TrafficSignal
edges = {} # node_id -> set of connected node_ids
nodes_lock = threading.Lock()
publish_queue = queue.Queue()
global_operating_mode = 'STATIC'

def node_simulator(node_id):
    print(f"Started simulator for node {node_id}")
    
    while True:
        try:
            with nodes_lock:
                if node_id not in nodes or not nodes[node_id].active:
                    break
                signal = nodes[node_id]
                
            # Process cycle (runs every 1 second simulated)
            signal.process()
            signal.action_doer()
            
            state = signal.get_state()
            logs = signal.pop_logs()
            
            message = {
                'type': 'LIGHT_UPDATE',
                'node': node_id,
                'density': state['density'],
                'light': state['light'],
                'timestamp': time.time(),
                'logs': logs
            }
            
            publish_queue.put(('traffic.' + node_id, message))
        except Exception as e:
            print(f"Error in node_simulator {node_id}: {e}")
        time.sleep(1) # Faster simulation cycle so 10s phases feel responsive

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
    global global_operating_mode
    try:
        msg = json.loads(body)
        print(f"Topology update: {msg}")
        msg_type = msg.get("type")
        
        with nodes_lock:
            if msg_type == "reset":
                for n_id, signal in nodes.items():
                    signal.stop()
                nodes.clear()
                edges.clear()
                print("Backend topology reset.")
            elif msg_type == "add_node":
                node_id = msg.get("id")
                if node_id and node_id not in nodes:
                    nodes[node_id] = TrafficSignal(node_id)
                    nodes[node_id].set_mode(global_operating_mode)
                    # By default assume all nodes have N, S, E, W just in case
                    # But we'll rely on add_edge to add true connections.
                    t = threading.Thread(target=node_simulator, args=(node_id,), daemon=True)
                    t.start()
                    
            elif msg_type == "add_edge":
                src = msg.get("source")
                tgt = msg.get("target")
                src_dir = msg.get("sourceDir", "S") # Default S outgoing
                tgt_dir = msg.get("targetDir", "N") # Default N incoming
                
                if src not in edges: edges[src] = set()
                if tgt not in edges: edges[tgt] = set()
                edges[src].add(tgt)
                edges[tgt].add(src)
                
                if src in nodes:
                    nodes[src].add_connection(src_dir)
                if tgt in nodes:
                    nodes[tgt].add_connection(tgt_dir)
                
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
                            nodes[t].set_override("Green", 5) # force green for next 5 ticks
            elif msg_type == "set_mode":
                global_operating_mode = msg.get("mode")
                for n_id, signal in nodes.items():
                    signal.set_mode(global_operating_mode)
                print(f"Global operating mode set to {global_operating_mode}")
            elif msg_type == "vision_sensor":
                n_id = msg.get("nodeId")
                direction = msg.get("direction", "N")
                count = msg.get("waitingCars", 0)
                density = msg.get("density", 0.0)
                ambulance = msg.get("hasAmbulance", False)
                if n_id in nodes:
                    nodes[n_id].update_cv_telemetry(direction, count, density, ambulance)
                    # Backwards compatibility during transition
                    nodes[n_id].update_density(count)
            elif msg_type == "proactive_message":
                tgt = msg.get("target")
                if tgt in nodes:
                    nodes[tgt].add_incoming(msg.get("count", 0))
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
    uvicorn.run(app, host="0.0.0.0", port=8001)
