import random
import numpy as np

class AIController:
    """
    Decentralized Graph Attention Network (GAT) AI Controller.
    Uses Message-Passing representation learning to coordinate with neighbors.
    Approximates action Q-values (selecting direct Green lanes N, S, E, W) using linear TD-learning.
    """
    def __init__(self):
        # Set random seeds for consistent baseline initialization
        np.random.seed(42)
        
        # Dimensions
        self.feat_dim = 8     # 4 queues + 4 green-light status values
        self.hidden_dim = 8   # GAT hidden feature state size
        
        # GAT Model Weights
        self.W_k = np.random.randn(self.hidden_dim, self.feat_dim) * 0.1  # Local weight
        self.W_n = np.random.randn(self.hidden_dim, self.feat_dim) * 0.1  # Neighbor weight
        self.W_a = np.random.randn(self.hidden_dim, self.feat_dim) * 0.1  # Attention projection
        self.V = np.random.randn(self.hidden_dim * 2) * 0.1              # Attention vector
        
        # Policy Network Linear Q-Approximator: Q(h_i, direction) = Theta[direction]^T * h_i
        # Maps hidden state to Q-values for direct phase selection (N, S, E, W)
        self.Theta = {
            'N': np.random.randn(self.hidden_dim) * 0.1,
            'S': np.random.randn(self.hidden_dim) * 0.1,
            'E': np.random.randn(self.hidden_dim) * 0.1,
            'W': np.random.randn(self.hidden_dim) * 0.1
        }
        
        # RL Hyperparameters
        self.alpha = 0.05   # Learning rate
        self.gamma = 0.9    # Discount factor
        self.epsilon = 0.1  # Exploration rate
        
        # Memory buffers for Temporal Difference learning updates
        self.last_h = None
        self.last_action = None
        self.last_q_value = 0.0
        self.last_loss = 0.0

    def run_gat(self, local_features, neighbor_features):
        """
        Runs Graph Attention convolution forward pass to calculate hidden state h_i.
        local_features: List of length 8 [q_N, q_S, q_E, q_W, p_N, p_S, p_E, p_W]
        neighbor_features: List of neighbor feature lists (each of length 8)
        """
        x_i = np.array(local_features, dtype=np.float32)
        proj_i = np.dot(self.W_k, x_i)
        
        if not neighbor_features:
            # Boundary nodes with no neighbors do local aggregation only
            return np.maximum(0.0, proj_i)
            
        proj_neighbors = []
        attn_scores = []
        
        # Compute projection query and keys for target node i
        q_i = np.dot(self.W_a, x_i)
        
        for x_j in neighbor_features:
            x_j_arr = np.array(x_j, dtype=np.float32)
            proj_j = np.dot(self.W_n, x_j_arr)
            proj_neighbors.append(proj_j)
            
            # Key projection
            k_j = np.dot(self.W_a, x_j_arr)
            
            # Concatenate query and key features
            concat_feat = np.concatenate([q_i, k_j])
            
            # Raw attention coeff with LeakyReLU activation
            e_ij = np.dot(self.V, concat_feat)
            e_ij = e_ij if e_ij > 0.0 else e_ij * 0.2
            attn_scores.append(e_ij)
            
        # Softmax over neighbor attention coefficients
        attn_scores = np.array(attn_scores, dtype=np.float32)
        exp_scores = np.exp(attn_scores - np.max(attn_scores))  # Numerical stability
        alpha = exp_scores / np.sum(exp_scores)
        
        # Aggregate neighbor states
        agg_neighbors = np.zeros(self.hidden_dim, dtype=np.float32)
        for idx, proj_j in enumerate(proj_neighbors):
            agg_neighbors += alpha[idx] * proj_j
            
        # Relu activation on aggregated Graph Features
        h_i = np.maximum(0.0, proj_i + agg_neighbors)
        return h_i

    def select_action(self, h_i, active_phases):
        """
        Selects next Green direction phase index directly using GAT features.
        Uses epsilon-greedy exploration.
        """
        q_values = {d: float(np.dot(h_i, self.Theta[d])) for d in active_phases}
        
        if random.random() < self.epsilon:
            chosen_dir = random.choice(active_phases)
        else:
            chosen_dir = max(q_values, key=q_values.get)
            
        self.last_h = h_i
        self.last_action = chosen_dir
        self.last_q_value = q_values[chosen_dir]
        
        return chosen_dir

    def update_policy(self, reward, next_h_i, next_active_phases):
        """
        Updates the approximator weights (Theta) using Temporal Difference Q-learning.
        """
        if self.last_h is None or self.last_action is None:
            return
            
        # Compute max Q-value of the next state over valid active phases
        q_next = {d: float(np.dot(next_h_i, self.Theta[d])) for d in next_active_phases}
        max_q_next = max(q_next.values()) if q_next else 0.0
        
        # Bellman Target
        target = reward + self.gamma * max_q_next
        td_error = target - self.last_q_value
        
        # Policy gradient update on weights
        self.Theta[self.last_action] += self.alpha * td_error * self.last_h
        
        # Record squared TD error as loss metrics
        self.last_loss = float(td_error ** 2)

    def get_optimal_duration(self, active_direction, all_telemetry, incoming_count=0):
        """Backward compat shim for legacy STATIC calls."""
        return 15

# =====================================================================
# MODULAR AGENT ENTRANCE (MODIFIABLE ACTION ZONE)
# =====================================================================

def run_agent_decision(controller, local_features, neighbor_features, active_phases):
    """
    MODULAR AGENT ACTION FUNCTION
    Runs GAT message aggregation and returns the chosen phase direction (e.g. 'N', 'S').
    """
    # # your code goes here
    h_i = controller.run_gat(local_features, neighbor_features)
    chosen_dir = controller.select_action(h_i, active_phases)
    return chosen_dir

def update_agent_rewards(controller, reward, next_local_features, next_neighbor_features, next_active_phases):
    """
    MODULAR REWARD / LOSS UPDATE FUNCTION
    Calculates next state features and performs TD-gradient step.
    """
    # # your code goes here
    next_h_i = controller.run_gat(next_local_features, next_neighbor_features)
    controller.update_policy(reward, next_h_i, next_active_phases)
