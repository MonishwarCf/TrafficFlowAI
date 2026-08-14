import time
from backend_python.traffic_signal import TrafficSignal

node = TrafficSignal("Node1")
node.add_connection("N")
node.add_connection("E")

for _ in range(10):
    node.process()
    node.action_doer()
    print(node.get_state())
