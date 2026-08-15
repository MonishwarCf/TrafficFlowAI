import random

class AIController:
    """
    True Q-Learning Engine with full Phase Selection autonomy.
    The AI controls BOTH which direction gets the green light AND how long.
    State: (ActiveDensityLevel, MaxCrossDensityLevel)
    Action: duration_seconds (phase direction is now selected by urgency score)
    """
    
    def __init__(self):
        # Seeded initial durations mapping (ActiveDensity, CrossDensity) -> Duration
        seeded_durations = {
            # Emergency overrides
            ('E', 'E'): 15, ('E', 'H'): 30, ('E', 'M'): 30, ('E', 'L'): 30,
            ('H', 'E'): 5,  ('M', 'E'): 5,  ('L', 'E'): 5,
            
            # Standard traffic flow
            ('H', 'H'): 15, ('H', 'M'): 20, ('H', 'L'): 30,
            ('M', 'H'): 10, ('M', 'M'): 15, ('M', 'L'): 20,
            ('L', 'H'): 5,  ('L', 'M'): 10, ('L', 'L'): 10,
        }
        
        self.durations = [5, 10, 15, 20, 30]
        self.q_table = {}
        
        # Initialize and seed Q-table: Q((active_density, cross_density), duration)
        states = ['E', 'H', 'M', 'L']
        for a_state in states:
            for c_state in states:
                optimal_dur = seeded_durations.get((a_state, c_state), 10)
                for dur in self.durations:
                    self.q_table[((a_state, c_state), dur)] = 100.0 if dur == optimal_dur else 0.0

        self.alpha = 0.5   # High learning rate for fast convergence
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

    def _score_direction(self, direction, all_telemetry):
        """Scores a direction urgency - Emergency > High > Medium > Low."""
        lane_data = all_telemetry.get(direction, {})
        state = self._discretize(lane_data)
        density = lane_data.get('density', 0.0)
        car_count = lane_data.get('car_count', 0)
        if state == 'E':
            return 1000.0
        if state == 'H':
            return density * 100 + car_count
        if state == 'M':
            return density * 50 + car_count
        return density * 10 + car_count

    def select_next_phase(self, active_phases, all_telemetry, incoming_count=0):
        """
        PHASE SELECTION: AI selects which direction should go green next
        based on urgency, AND chooses the optimal duration via Q-table.
        Returns (chosen_direction, optimal_duration).
        """
        if not active_phases or not all_telemetry:
            return (active_phases[0] if active_phases else None), 10

        # Score each candidate direction by urgency
        scored = [(self._score_direction(d, all_telemetry) + (incoming_count * 10 if incoming_count > 5 else 0), d)
                  for d in active_phases]
        scored.sort(reverse=True)

        # Epsilon-greedy phase selection
        if random.random() < self.epsilon:
            chosen_dir = random.choice(active_phases)
        else:
            chosen_dir = scored[0][1]

        # Determine optimal duration for chosen direction
        active_state = self._discretize(all_telemetry.get(chosen_dir, {}))
        cross_states = [self._discretize(all_telemetry.get(d, {})) for d in active_phases if d != chosen_dir]
        cross_state = 'L'
        for p in ['E', 'H', 'M', 'L']:
            if p in cross_states:
                cross_state = p
                break

        state = (active_state, cross_state)

        # Epsilon-greedy duration selection
        if random.random() < self.epsilon:
            duration = random.choice(self.durations)
        else:
            q_values = {dur: self.q_table.get((state, dur), 0.0) for dur in self.durations}
            duration = max(q_values, key=q_values.get)

        self.last_state = state
        self.last_action = duration
        self.last_q_value = self.q_table.get((state, duration), 0.0)

        return chosen_dir, duration

    def update_q_value(self, reward):
        """Updates the Q-table based on the reward from the LAST action taken."""
        if not self.last_state or not self.last_action:
            return
        state = self.last_state
        action = self.last_action
        old_q = self.q_table.get((state, action), 0.0)
        new_q = old_q + self.alpha * (reward - old_q)
        self.q_table[(state, action)] = new_q
        self.last_loss = reward - old_q

    def get_optimal_duration(self, active_direction, all_telemetry, incoming_count=0):
        """Backward compat shim for STATIC mode."""
        _, duration = self.select_next_phase([active_direction], all_telemetry, incoming_count)
        return duration

