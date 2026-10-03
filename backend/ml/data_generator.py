"""
VoxPlan Realistic Historical Task Data Generator.
Generates plausible project management task records with realistic delay-risk relationships.
"""

import numpy as np
import pandas as pd


def generate_historical_tasks(num_samples: int = 1000, random_seed: int = 42) -> pd.DataFrame:
    """
    Generates synthetic historical task records for training VoxPlan delay-risk ML models.
    
    Args:
        num_samples: Number of historical task records to generate.
        random_seed: Seed for reproducible dataset generation.
        
    Returns:
        pd.DataFrame containing engineered task records with target 'overdue'.
    """
    rng = np.random.RandomState(random_seed)

    projects = ['Core Platform', 'Security Infrastructure', 'API Gateway', 'Mobile App', 'Analytics Engine']
    priorities = ['low', 'medium', 'high']
    priority_weights = [0.35, 0.45, 0.20]

    task_records = []

    for i in range(num_samples):
        task_id = f"hist-task-{i + 1:04d}"
        project = rng.choice(projects)
        priority = rng.choice(priorities, p=priority_weights)

        # Baseline features
        estimated_effort = float(rng.gamma(shape=3.0, scale=3.5))  # range ~2 - 40 hours
        estimated_effort = max(1.0, min(50.0, round(estimated_effort, 1)))

        days_remaining = int(rng.normal(loc=4.5, scale=3.5))
        days_remaining = max(-1, min(20, days_remaining))

        task_age = int(rng.exponential(scale=5.0)) + 1
        task_age = min(30, task_age)

        dependency_count = int(rng.poisson(lam=1.4))
        dependency_count = min(6, dependency_count)

        project_pending_tasks = rng.randint(1, 15)
        project_completion_rate = float(np.clip(rng.beta(a=5, b=2), 0.1, 0.98))
        historical_user_completion_rate = float(np.clip(rng.beta(a=6, b=2.5), 0.2, 0.99))
        previous_overdue_count = int(rng.poisson(lam=1.2))

        workload_score = float(np.clip(
            (project_pending_tasks * 0.4) + (estimated_effort * 0.15) + (previous_overdue_count * 0.5) + rng.normal(0, 0.5),
            1.0, 10.0
        ))

        # Priority numeric mapping for risk modeling
        p_val = {'low': 1, 'medium': 2, 'high': 3}[priority]

        # Calculate latent log-odds of delay with realistic project management dynamics
        # Risk factors: tight deadline, high effort, high dependencies, high workload, past overdue history
        latent_risk = (
            -0.85 * (days_remaining - 4.0)          # Tight deadline increases risk
            + 0.12 * estimated_effort               # Heavy tasks take longer than anticipated
            + 0.55 * dependency_count               # Blocked by dependencies
            + 0.40 * (workload_score - 4.5)         # Overloaded sprint
            + 0.45 * (p_val - 1.5)                  # High priority often carries higher complexity/pressure
            - 2.80 * (historical_user_completion_rate - 0.70) # Low historical reliability
            + 0.35 * previous_overdue_count         # Recurring bottleneck pattern
            + 0.08 * task_age                       # Stale tasks stall out
            + rng.normal(0.0, 1.1)                  # Real-world variance/noise
        )

        # Sigmoid probability
        prob_overdue = 1.0 / (1.0 + np.exp(-latent_risk))

        # Binary label with realistic stochasticity
        is_overdue = int(rng.rand() < prob_overdue)

        # Actual effort reflection
        effort_multiplier = rng.uniform(1.2, 1.9) if is_overdue else rng.uniform(0.8, 1.15)
        actual_effort = round(estimated_effort * effort_multiplier, 1)

        status = 'overdue' if is_overdue else 'completed'

        task_records.append({
            'task_id': task_id,
            'project': project,
            'priority': priority,
            'estimated_effort': estimated_effort,
            'actual_effort': actual_effort,
            'days_remaining': days_remaining,
            'task_age': task_age,
            'dependency_count': dependency_count,
            'project_pending_tasks': project_pending_tasks,
            'project_completion_rate': round(project_completion_rate, 3),
            'historical_user_completion_rate': round(historical_user_completion_rate, 3),
            'previous_overdue_count': previous_overdue_count,
            'workload_score': round(workload_score, 2),
            'status': status,
            'completed': True,
            'overdue': is_overdue
        })

    df = pd.DataFrame(task_records)
    return df


if __name__ == '__main__':
    data = generate_historical_tasks(1000)
    print("Generated historical tasks shape:", data.shape)
    print("Overdue class distribution:\n", data['overdue'].value_counts(normalize=True))
