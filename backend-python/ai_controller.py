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
        """
        Scores a direction urgency using exponential scaling so larger queues
        dominate decisively over smaller ones. A 15-car lane will score much
        higher than a 7-car lane, making starvation cases rare.
        """
        lane_data = all_telemetry.get(direction, {})
        state = self._discretize(lane_data)
        car_count = lane_data.get('car_count', 0)
        density = lane_data.get('density', 0.0)
        if state == 'E':
            return 10000.0  # Ambulance always wins absolutely
        # Exponential: car_count^1.5 means 15 cars -> 58.1, 7 cars -> 18.5
        # Gap between 15 and 7 is 3x, not 2x like linear scoring.
        return (car_count ** 1.5) + (density * 20)

    def select_next_phase(self, active_phases, all_telemetry, incoming_by_dir=None, incoming_count=0):
        """
        PHASE SELECTION: AI selects which direction should go green next
        based on urgency, AND chooses the optimal duration via Q-table.
        incoming_by_dir: dict {'N': count, 'S': count, ...} per-direction platoon alerts.
        Returns (chosen_direction, optimal_duration).
        """
        if not active_phases or not all_telemetry:
            return (active_phases[0] if active_phases else None), 10

        if incoming_by_dir is None:
            incoming_by_dir = {}

        scored = []
        for d in active_phases:
            base_score = self._score_direction(d, all_telemetry)
            # Incoming bonus is capped at 50% of a full-lane score (100) so it
            # can never beat a direction that already has real heavy traffic.
            dir_incoming = incoming_by_dir.get(d, 0)
            incoming_bonus = min(dir_incoming * 3, 50) if dir_incoming > 3 else 0
            scored.append((base_score + incoming_bonus, d))

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

        # Hard floor: duration must cover the FULL queue, not half.
        # car_count // 2 was mathematically guaranteeing queues never drain.
        # Now: 12 cars -> floor 12s, 20 cars -> floor 20s (capped at 30).
        active_car_count = all_telemetry.get(chosen_dir, {}).get('car_count', 0)
        min_floor = min(30, max(5, active_car_count))
        duration = max(duration, min_floor)

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
        _, duration = self.select_next_phase([active_direction], all_telemetry, incoming_count=incoming_count)
        return duration
