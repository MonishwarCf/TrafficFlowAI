import threading
import time
from ai_controller import AIController

class TrafficSignal:
    def __init__(self, node_id):
        self.node_id = node_id
        # Directions connected (either incoming or outgoing)
        self.connected_directions = {'N': False, 'S': False, 'E': False, 'W': False}
        self.active_phases = [] # Ordered list of connected directions to loop through
        self.current_phase_index = 0
        self.phase_timer = 0
        self.phase_duration = 3 # 3 seconds per phase
        
        self.light_state = {'N': 'Red', 'S': 'Red', 'E': 'Red', 'W': 'Red'}
        self.active = True
        self.lock = threading.Lock()
        
        # Additional state
        self.density = 0
        self.incoming = 0
        self.override = None
        self.override_time = 0
        self.logs = []
        
        self.operating_mode = 'STATIC' # 'STATIC' or 'AI'
        
        self.ai = AIController()
        self.ai_phase_timer = 0
        self.ai_phase_duration = 0
        
        # Future-proofing: store rich telemetry from simulated cameras/CV models
        self.cv_telemetry = {
            'N': {'car_count': 0, 'density': 0.0, 'ambulance': False},
            'S': {'car_count': 0, 'density': 0.0, 'ambulance': False},
            'E': {'car_count': 0, 'density': 0.0, 'ambulance': False},
            'W': {'car_count': 0, 'density': 0.0, 'ambulance': False}
        }

    def add_connection(self, direction):
        if direction not in ['N', 'S', 'E', 'W']:
            return
        with self.lock:
            if not self.connected_directions[direction]:
                self.connected_directions[direction] = True
                current_active = self.active_phases[self.current_phase_index] if self.active_phases else None
                
                self.active_phases.append(direction)
                order = {'N': 0, 'E': 1, 'S': 2, 'W': 3}
                self.active_phases.sort(key=lambda d: order[d])
                
                if current_active:
                    self.current_phase_index = self.active_phases.index(current_active)

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

            if self.operating_mode == 'STATIC':
                self.phase_timer += 1
                if self.phase_timer >= self.phase_duration:
                    self.phase_timer = 0
                    self.current_phase_index = (self.current_phase_index + 1) % len(self.active_phases)
                    self.logs.append(f"Static: Switched to {self.active_phases[self.current_phase_index]} for {self.phase_duration}s")
            elif self.operating_mode == 'AI':
                if self.ai_phase_duration == 0 and self.active_phases:
                    active_dir = self.active_phases[self.current_phase_index]
                    self.ai_phase_duration = self.ai.get_optimal_duration(active_dir, self.cv_telemetry, self.incoming)

                self.ai_phase_timer += 1
                
                # Midway check (O(1) interrupt)
                if self.ai_phase_timer == self.ai_phase_duration // 2 and self.active_phases:
                    active_dir = self.active_phases[self.current_phase_index]
                    new_duration = self.ai.get_optimal_duration(active_dir, self.cv_telemetry, self.incoming)
                    if new_duration <= self.ai_phase_timer:
                        self.ai_phase_timer = self.ai_phase_duration # Force switch immediately
                        self.logs.append(f"AI Interrupt: Early switch to next phase (Midway Check yielded {new_duration}s)")
                        
                if self.ai_phase_timer >= self.ai_phase_duration:
                    self.ai_phase_timer = 0
                    self.incoming = 0 # Reset incoming count when we switch phases
                    self.current_phase_index = (self.current_phase_index + 1) % len(self.active_phases)
                    if self.active_phases:
                        active_dir = self.active_phases[self.current_phase_index]
                        self.ai_phase_duration = self.ai.get_optimal_duration(active_dir, self.cv_telemetry, self.incoming)
                        self.logs.append(f"AI: Switched to {active_dir} for {self.ai_phase_duration}s")

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

    def set_mode(self, mode):
        with self.lock:
            if mode in ['STATIC', 'AI']:
                self.operating_mode = mode

    def update_cv_telemetry(self, direction, car_count, density, ambulance):
        """
        Receives real inputs from the future CV MODEL (or React vision_sensor).
        """
        if direction not in self.cv_telemetry: return
        with self.lock:
            self.cv_telemetry[direction] = {
                'car_count': car_count,
                'density': density,
                'ambulance': ambulance
            }

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
                'active_phases': list(self.active_phases),
                'mode': self.operating_mode,
                'cv_telemetry': self.cv_telemetry.copy()
            }

    def pop_logs(self):
        with self.lock:
            if not self.logs:
                return []
            popped = list(self.logs)
            self.logs.clear()
            return popped
