class AIController:
    """
    O(1) Reinforcement Learning Engine
    Instead of running a heavy neural network at runtime, this controller uses a
    'Distilled Q-Table' (a dictionary) that maps discretised traffic states 
    to optimal phase durations. This guarantees microsecond inference times.
    """
    
    def __init__(self):
        # The Action Space: mapping (ActiveDensity, CrossDensity) -> Duration in seconds
        # 'E' = Emergency (Ambulance), 'H' = High (>0.7), 'M' = Medium (0.3-0.7), 'L' = Low (<0.3)
        self.q_table = {
            # Emergency overrides
            ('E', 'E'): 15, # Both have emergencies, share time
            ('E', 'H'): 30, # Clear the emergency
            ('E', 'M'): 30,
            ('E', 'L'): 30,
            ('H', 'E'): 0,  # Cross traffic has emergency! Switch IMMEDIATELY!
            ('M', 'E'): 0,
            ('L', 'E'): 0,
            
            # Standard traffic flow
            ('H', 'H'): 15, # Gridlock: keep it moving frequently to prevent starvation
            ('H', 'M'): 20, # Heavy traffic, give it time
            ('H', 'L'): 30, # High priority, keep green
            
            ('M', 'H'): 10, # Give medium some time, but yield to high cross traffic
            ('M', 'M'): 15, # Balanced
            ('M', 'L'): 20, 
            
            ('L', 'H'): 5,  # Barely anyone here, switch fast to help cross traffic
            ('L', 'M'): 8,
            ('L', 'L'): 10, # Ghost town, cycle normally
        }

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

        # 3. O(1) Q-Table Lookup
        duration = self.q_table.get((active_state, cross_state), 10)
        return duration
