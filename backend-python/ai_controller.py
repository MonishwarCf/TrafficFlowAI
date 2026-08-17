class HeuristicController:
    """
    Deterministic Smart Heuristic Controller.
    Scores phases based on immediate queue lengths and starvation timers, 
    eliminating the need for RL training.
    """
    def __init__(self):
        self.starvation_timers = {'N': 0, 'S': 0, 'E': 0, 'W': 0}
        self.last_action = None
        self.last_loss = 0.0 # Kept for backward compatibility with frontend metrics

    def select_action(self, cv_telemetry, active_phases):
        """
        Calculates a priority score for each active phase.
        Score = (Queue Length * 10) + (Starvation Cycles * 2)
        """
        if not active_phases:
            return None

        scores = {}
        for d in active_phases:
            car_count = cv_telemetry.get(d, {}).get('car_count', 0)
            starvation = self.starvation_timers.get(d, 0)
            scores[d] = (car_count * 10) + (starvation * 2)

        # Select phase with highest score
        chosen_dir = max(scores, key=scores.get)

        # Dynamic Proportional Time
        winning_car_count = cv_telemetry.get(chosen_dir, {}).get('car_count', 0)
        optimal_duration = min(20.0, 5.0 + (winning_car_count * 0.75))

        # Update starvation timers: reset for chosen, increment for ignored active phases
        for d in self.starvation_timers:
            if d in active_phases:
                if d == chosen_dir:
                    self.starvation_timers[d] = 0
                else:
                    self.starvation_timers[d] += 1
            else:
                self.starvation_timers[d] = 0 # Not active, no starvation

        self.last_action = chosen_dir
        self.last_loss = float(scores[chosen_dir]) # Display the winning score instead of loss
        
        return chosen_dir, optimal_duration

# =====================================================================
# MODULAR AGENT ENTRANCE (MODIFIABLE ACTION ZONE)
# =====================================================================

def run_agent_decision(controller, cv_telemetry, active_phases):
    """
    MODULAR AGENT ACTION FUNCTION
    Runs heuristic scoring and returns the chosen phase direction and optimal duration.
    """
    chosen_dir, optimal_duration = controller.select_action(cv_telemetry, active_phases)
    return chosen_dir, optimal_duration

def update_agent_rewards(controller, reward, next_local_features, next_neighbor_features, next_active_phases):
    """
    NO-OP Function. RL has been replaced by Heuristics.
    """
    pass
