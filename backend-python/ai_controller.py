class AIController:
    """
    O(1) Reinforcement Learning Engine
    Instead of running a heavy neural network at runtime, this controller uses a
    'Distilled Q-Table' (a dictionary) that maps discretised traffic states 
    to optimal phase durations. This guarantees microsecond inference times.
    """
    
    def __init__(self):
        # Seeded initial durations mapping (ActiveDensity, CrossDensity) -> Duration
        seeded_durations = {
            # Emergency overrides
            ('E', 'E'): 15, ('E', 'H'): 30, ('E', 'M'): 30, ('E', 'L'): 30,
            ('H', 'E'): 5,  ('M', 'E'): 5,  ('L', 'E'): 5, # Actions must be in self.actions
            
            # Standard traffic flow
            ('H', 'H'): 15, ('H', 'M'): 20, ('H', 'L'): 30,
            ('M', 'H'): 10, ('M', 'M'): 15, ('M', 'L'): 20,
            ('L', 'H'): 5,  ('L', 'M'): 10, ('L', 'L'): 10,
        }
        
        self.actions = [5, 10, 15, 20, 30]
        self.q_table = {}
        
        # Initialize and seed Q-table
        states = ['E', 'H', 'M', 'L']
        for a_state in states:
            for c_state in states:
                optimal_dur = seeded_durations.get((a_state, c_state), 10)
                for action in self.actions:
                    # Give the seeded duration a high initial Q-value
                    self.q_table[((a_state, c_state), action)] = 100.0 if action == optimal_dur else 0.0

        self.alpha = 0.5   # High learning rate
        self.gamma = 0.9   # Discount factor
        self.epsilon = 0.1 # Exploration rate
        self.last_state = None
        self.last_action = None
        self.last_q_value = 0.0
        self.last_loss = 0.0

    def _discretize(self, lane_data):
        """Converts raw density into a categorical state for the Q-Table."""
        if lane_data.get('ambulance', False):
            return 'E'
        density = lane_data.get('density', 0.0)
        if density > 0.7:
            return 'H'
        elif density > 0.3:
            return 'M'
        return 'L'

    def get_optimal_duration(self, active_direction, all_telemetry, incoming_count=0):
        """
        O(1) Lookup for the optimal phase duration.
        """
        if not active_direction or not all_telemetry:
            return 10 # Fallback

        # 1. State of the active green phase
        active_state = self._discretize(all_telemetry.get(active_direction, {}))
        
        # Proactive Gossip: If a massive platoon is coming, treat our active state as 'H' (High)
        # to ensure we keep the light green for them before they even arrive on camera!
        if incoming_count > 5 and active_state in ['L', 'M']:
            active_state = 'H'
        
        # 2. State of cross traffic (max density of all red lights)
        cross_states = []
        for dir_key, data in all_telemetry.items():
            if dir_key != active_direction:
                cross_states.append(self._discretize(data))
                
        # Priority: E > H > M > L
        if 'E' in cross_states:
            cross_state = 'E'
        elif 'H' in cross_states:
            cross_state = 'H'
        elif 'M' in cross_states:
            cross_state = 'M'
        else:
            cross_state = 'L'

        state = (active_state, cross_state)
        
        # Epsilon-Greedy Exploration
        import random
        if random.random() < self.epsilon:
            duration = random.choice(self.actions)
        else:
            # Exploitation: argmax action
            q_values = {a: self.q_table.get((state, a), 0.0) for a in self.actions}
            duration = max(q_values, key=q_values.get)

        self.last_state = state
        self.last_action = duration
        self.last_q_value = self.q_table.get((state, duration), 0.0)
        
        return duration

    def update_q_value(self, reward):
        """Updates the Q-table based on the reward from the LAST action taken."""
        if not self.last_state or not self.last_action:
            return
            
        state = self.last_state
        action = self.last_action
        
        old_q = self.q_table.get((state, action), 0.0)
        
        # Since we don't know next state until next phase, we just do a simplified 
        # immediate reward update (Terminal state for that phase's decision)
        # Q(s,a) = Q(s,a) + alpha * (reward - Q(s,a))
        new_q = old_q + self.alpha * (reward - old_q)
        
        self.q_table[(state, action)] = new_q
        self.last_loss = reward - old_q # Simplified loss definition
