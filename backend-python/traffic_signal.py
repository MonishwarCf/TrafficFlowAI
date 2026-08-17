import threading
import time
from ai_controller import HeuristicController, run_agent_decision, update_agent_rewards

class TrafficSignal:
    def __init__(self, node_id):
        self.node_id = node_id
        # Directions connected (either incoming or outgoing)
        self.connected_directions = {'N': False, 'S': False, 'E': False, 'W': False}
        self.active_phases = [] # Ordered list of connected directions to loop through
        self.current_phase_index = 0
        self.phase_timer = 0
        self.phase_duration = 15 # 15 seconds per phase
        
        self.light_state = {'N': 'Red', 'S': 'Red', 'E': 'Red', 'W': 'Red'}
        self.active = True
        self.lock = threading.RLock() # Reentrant lock to prevent nested thread deadlocks
        
        # Additional state
        self.density = 0
        self.incoming = {'N': 0, 'S': 0, 'E': 0, 'W': 0}  # per-direction platoon alerts
        self.override = None
        self.override_time = 0
        self.logs = []
        
        self.operating_mode = 'AI' # 'STATIC' or 'AI'
        
        self.ai = HeuristicController()
        self.ai_phase_timer = 0
        self.ai_phase_duration = 10 # 10s decision interval (prevents micro-switching)
        
        self.yellow_timer = 0
        self.yellow_phase = None
        self.next_active_phase = None
        
        # Graph Message-Passing neighbors features state
        self.neighbor_map = {}       # direction -> connected_node_id
        self.neighbor_features = {}  # connected_node_id -> feature vector [8]
        
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

    def get_local_features(self):
        """Compiles the local 8-element node feature vector: 4 queues + 4 light configurations."""
        with self.lock:
            q = [min(1.0, self.cv_telemetry[d]['car_count'] / 15.0) for d in ['N', 'S', 'E', 'W']]
            p = [1.0 if self.light_state[d] == 'Green' else 0.0 for d in ['N', 'S', 'E', 'W']]
            return q + p

    def update_neighbor_feature(self, neighbor_id, features):
        """Accepts message features from an upstream/downstream neighbor."""
        with self.lock:
            self.neighbor_features[neighbor_id] = features

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
                if self.yellow_timer > 0:
                    self.yellow_timer -= 1
                    if self.yellow_timer <= 0:
                        self.current_phase_index = self.active_phases.index(self.next_active_phase)
                        self.yellow_phase = None
                        self.next_active_phase = None
                        self.phase_timer = 0
                else:
                    self.phase_timer += 1
                    if self.phase_timer >= self.phase_duration:
                        next_idx = (self.current_phase_index + 1) % len(self.active_phases)
                        self.next_active_phase = self.active_phases[next_idx]
                        self.yellow_phase = self.active_phases[self.current_phase_index]
                        self.yellow_timer = 3
                        self.logs.append(f"Static: Switched to Yellow for 3s before {self.next_active_phase}")
            elif self.operating_mode == 'AI':
                if self.yellow_timer > 0:
                    self.yellow_timer -= 1
                    if self.yellow_timer <= 0:
                        if self.next_active_phase in self.active_phases:
                            self.current_phase_index = self.active_phases.index(self.next_active_phase)
                        self.yellow_phase = None
                        self.next_active_phase = None
                        self.ai_phase_timer = 0
                    return # skip GAT action while yellow

                # Check for ambulance override preemption (Priority Action Masking)
                ambulance_dir = None
                for d in self.active_phases:
                    if self.cv_telemetry.get(d, {}).get('ambulance', False):
                        ambulance_dir = d
                        break

                # If an ambulance is detected, immediately override and bypass the GAT policy
                if ambulance_dir is not None:
                    active_dir = self.active_phases[self.current_phase_index]
                    if active_dir != ambulance_dir:
                        self.current_phase_index = self.active_phases.index(ambulance_dir)
                        self.logs.append(f"AI Preemption Override: Ambulance detected on {ambulance_dir}! Switched Green.")
                    self.ai_phase_timer = 0 # reset timer during preemption
                    return

                # Idle Node Bypass: if intersection is empty, hold lights without GAT convolutions
                total_cars = sum(data.get('car_count', 0) for data in self.cv_telemetry.values())
                if total_cars == 0:
                    self.ai_phase_timer = 0 # reset timer so there is no latency when a car arrives
                    return

                self.ai_phase_timer += 1

                # Dynamic decision interval
                if self.ai_phase_timer >= self.ai_phase_duration:
                    self.ai_phase_timer = 0
                    
                    # 1. Heuristic Scoring & Action Selection
                    chosen_dir, optimal_duration = run_agent_decision(self.ai, self.cv_telemetry, self.active_phases)
                    self.ai_phase_duration = optimal_duration
                    
                    # 2. Execute Decision
                    active_dir = self.active_phases[self.current_phase_index]
                    if chosen_dir in self.active_phases and chosen_dir != active_dir:
                        # Switch to Yellow state before actually changing Green
                        self.yellow_phase = active_dir
                        self.next_active_phase = chosen_dir
                        self.yellow_timer = 3
                        self.logs.append(f"AI: Switching to Yellow for 3s before {chosen_dir}")

                    self.logs.append(f"AI: Selected phase {chosen_dir} (score={self.ai.last_loss})")

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

            if self.yellow_timer > 0 and self.yellow_phase:
                self.light_state[self.yellow_phase] = 'Yellow'
            elif self.active_phases:
                active_dir = self.active_phases[self.current_phase_index]
                self.light_state[active_dir] = 'Green'

    def update_density(self, density):
        with self.lock:
            self.density = density

    def add_incoming(self, direction, count):
        """Records incoming platoon alert for a specific arrival direction."""
        with self.lock:
            if direction in self.incoming:
                self.incoming[direction] += count

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
            remaining = 0
            if self.active_phases:
                if self.operating_mode == 'STATIC':
                    remaining = self.phase_duration - self.phase_timer
                elif self.operating_mode == 'AI':
                    remaining = self.ai_phase_duration - self.ai_phase_timer
            
            return {
                'node_id': self.node_id,
                'light': self.light_state.copy(),
                'density': self.density,
                'incoming': sum(self.incoming.values()),  # total for display
                'incoming_by_dir': self.incoming.copy(),
                'active_phases': list(self.active_phases),
                'mode': self.operating_mode,
                'cv_telemetry': self.cv_telemetry.copy(),
                'remaining_time': remaining,
                'ai_action': self.ai.last_action if self.operating_mode == 'AI' else None,
                'ai_reward': self.ai.last_loss if self.operating_mode == 'AI' else None
            }

    def pop_logs(self):
        with self.lock:
            if not self.logs:
                return []
            popped = list(self.logs)
            self.logs.clear()
            return popped
