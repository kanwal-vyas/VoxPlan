"""
VoxPlan Live Prediction & Explainability Module.
Computes real RandomForest probability estimates and derives transparent feature explanations.
"""

from typing import Any, Dict, List, Optional
import numpy as np

from backend.ml.features import derive_features_from_task_dict
from backend.ml.train import load_model_metadata, load_trained_pipeline

LOW_THRESHOLD = 0.35
HIGH_THRESHOLD = 0.65


def get_risk_category(prob: float) -> str:
    """Classifies probability into LOW, MEDIUM, or HIGH risk categories."""
    if prob < LOW_THRESHOLD:
        return 'LOW'
    elif prob < HIGH_THRESHOLD:
        return 'MEDIUM'
    return 'HIGH'


def generate_task_explanation(derived_features: Dict[str, float], prob: float) -> List[str]:
    """
    Generates transparent, human-understandable contributing factors for a task's delay risk.
    """
    reasons = []

    days_rem = derived_features.get('days_remaining', 3.0)
    if days_rem <= 1:
        reasons.append(f"Immediate deadline pressure (only {int(days_rem)} day remaining)")
    elif days_rem <= 2:
        reasons.append(f"Tight turnaround window ({int(days_rem)} days remaining)")

    effort = derived_features.get('estimated_effort', 4.0)
    if effort >= 8.0:
        reasons.append(f"High estimated effort ({effort:.1f} hours of work)")
    elif effort >= 5.0:
        reasons.append(f"Moderate work scope ({effort:.1f} hours)")

    deps = derived_features.get('dependency_count', 0.0)
    if deps >= 2:
        reasons.append(f"Multiple blocking dependencies ({int(deps)} dependencies)")
    elif deps == 1:
        reasons.append("Single task dependency in chain")

    workload = derived_features.get('workload_score', 4.0)
    if workload >= 6.0:
        reasons.append("Elevated sprint workload pressure")

    priority = derived_features.get('priority_score', 2.0)
    if priority == 3.0:
        reasons.append("High priority tier with high complexity")

    hist_risk = derived_features.get('historical_risk', 1.0)
    if hist_risk >= 3.0:
        reasons.append("Historical bottleneck pattern in similar tasks")

    # If low risk, mention positive stabilizing factors
    if prob < LOW_THRESHOLD:
        if days_rem >= 3:
            reasons.append(f"Healthy deadline buffer ({int(days_rem)} days remaining)")
        if deps == 0:
            reasons.append("Zero blocking dependencies")
        if effort <= 4.0:
            reasons.append(f"Manageable task scope ({effort:.1f} hours)")

    if not reasons:
        reasons.append("Standard sprint scheduling parameters")

    return reasons


def predict_single_task(task: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Predicts overdue probability for a single task using the trained scikit-learn model.
    """
    pipeline = load_trained_pipeline()
    if pipeline is None:
        raise ValueError("ML model is not trained yet. Please train the model first.")

    derived_features = derive_features_from_task_dict(task, context=context)

    # Scikit-learn predict_proba returns [[P(on_time), P(overdue)]]
    input_data = [task]
    probabilities = pipeline.predict_proba(input_data)[0]
    prob_overdue = float(probabilities[1])

    risk_category = get_risk_category(prob_overdue)
    explanation = generate_task_explanation(derived_features, prob_overdue)

    return {
        'task_id': task.get('id', 'unknown'),
        'title': task.get('title', 'Untitled Task'),
        'probability': round(prob_overdue, 3),
        'risk': risk_category,
        'percentage': round(prob_overdue * 100, 1),
        'explanation': explanation,
        'derived_features': derived_features,
    }


def predict_batch_tasks(tasks: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Predicts overdue probabilities for a list of tasks and provides aggregated project risk intelligence.
    """
    pipeline = load_trained_pipeline()
    if pipeline is None:
        raise ValueError("ML model is not trained yet. Please train the model first.")

    if not tasks:
        return {
            'total_tasks': 0,
            'high_risk_count': 0,
            'medium_risk_count': 0,
            'low_risk_count': 0,
            'average_delay_probability': 0.0,
            'predictions': [],
            'model_status': 'trained'
        }

    # Derive context dynamically if not provided
    pending_tasks = [t for t in tasks if not t.get('completed', False)]
    completed_count = len([t for t in tasks if t.get('completed', False)])
    total_count = len(tasks)
    computed_context = context or {
        'project_pending_tasks': max(1, len(pending_tasks)),
        'project_completion_rate': (completed_count / total_count) if total_count > 0 else 0.0,
        'historical_user_completion_rate': 0.82,
        'previous_overdue_count': 1.0,
    }

    predictions = []
    for task in tasks:
        # If task is already completed, risk is 0%
        if task.get('completed', False):
            predictions.append({
                'task_id': task.get('id', 'unknown'),
                'title': task.get('title', 'Untitled Task'),
                'probability': 0.0,
                'risk': 'LOW',
                'percentage': 0.0,
                'explanation': ['Task is already completed.'],
                'is_completed': True
            })
        else:
            pred = predict_single_task(task, context=computed_context)
            pred['is_completed'] = False
            predictions.append(pred)

    pending_predictions = [p for p in predictions if not p.get('is_completed', False)]
    high_count = sum(1 for p in pending_predictions if p['risk'] == 'HIGH')
    med_count = sum(1 for p in pending_predictions if p['risk'] == 'MEDIUM')
    low_count = sum(1 for p in pending_predictions if p['risk'] == 'LOW')

    avg_prob = float(np.mean([p['probability'] for p in pending_predictions])) if pending_predictions else 0.0

    return {
        'total_tasks': len(tasks),
        'pending_tasks_count': len(pending_predictions),
        'high_risk_count': high_count,
        'medium_risk_count': med_count,
        'low_risk_count': low_count,
        'average_delay_probability': round(avg_prob, 3),
        'average_delay_percentage': round(avg_prob * 100, 1),
        'predictions': predictions,
        'model_status': 'trained'
    }
