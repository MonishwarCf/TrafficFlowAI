import threading
import time

class TrafficSignal:
    def __init__(self, node_id):
        self.node_id = node_id
        # Directions connected (either incoming or outgoing)
        self.connected_directions = {'N': False, 'S': False, 'E': False, 'W': False}
        self.active_phases = [] # Ordered list of connected directions to loop through
        self.current_phase_index = 0
        self.phase_timer = 0
        self.phase_duration = 10 # 10 seconds per phase
        
        self.light_state = {'N': 'Red', 'S': 'Red', 'E': 'Red', 'W': 'Red'}
        self.active = True
        self.lock = threading.Lock()
        
        # Additional state
        self.density = 0
        self.incoming = 0
        self.override = None
        self.override_time = 0

    def add_connection(self, direction):
        if direction not in ['N', 'S', 'E', 'W']:
            return
        with self.lock:
            if not self.connected_directions[direction]:
                self.connected_directions[direction] = True
                self.active_phases.append(direction)
                # Keep phases ordered: N -> E -> S -> W
                order = {'N': 0, 'E': 1, 'S': 2, 'W': 3}
                self.active_phases.sort(key=lambda d: order[d])

    def process(self):
        with self.lock:
            if not self.active:
                return

            if self.override and self.override_time > 0:
                self.override_time -= 1
                if self.override_time <= 0:
                    self.override = None
                return

            if not self.active_phases:
                return

            self.phase_timer += 1
            if self.phase_timer >= self.phase_duration:
                self.phase_timer = 0
                self.current_phase_index = (self.current_phase_index + 1) % len(self.active_phases)

    def action_doer(self):
        with self.lock:
            if not self.active:
                return

            # Default all to Red
            for d in ['N', 'S', 'E', 'W']:
                self.light_state[d] = 'Red'

            if self.override:
                # Force override state on all lights (e.g., Ambulance -> Green)
                for d in ['N', 'S', 'E', 'W']:
                    self.light_state[d] = self.override
                return

            if self.active_phases:
                active_dir = self.active_phases[self.current_phase_index]
                self.light_state[active_dir] = 'Green'

    def update_density(self, density):
        with self.lock:
            self.density = density

    def add_incoming(self, count):
        with self.lock:
            self.incoming += count

    def set_override(self, state, duration):
        with self.lock:
            self.override = state
            self.override_time = duration

    def stop(self):
        with self.lock:
            self.active = False

    def get_state(self):
        with self.lock:
            return {
                'node_id': self.node_id,
                'light': self.light_state.copy(),
                'density': self.density,
                'incoming': self.incoming,
                'active_phases': list(self.active_phases)
            }
