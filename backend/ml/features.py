"""
VoxPlan Feature Engineering Module.
Transforms raw task records into engineered numerical features for supervised ML modeling.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

FEATURE_NAMES = [
    'priority_score',
    'estimated_effort',
    'days_remaining',
    'task_age',
    'dependency_count',
    'project_pending_tasks',
    'project_completion_rate',
    'historical_user_completion_rate',
    'previous_overdue_count',
    'workload_score',
    'effort_ratio',
    'dependency_pressure',
    'deadline_pressure',
    'historical_risk',
]

FEATURE_LABELS = {
    'priority_score': 'Task Priority',
    'estimated_effort': 'Estimated Effort (Hours)',
    'days_remaining': 'Days Remaining',
    'task_age': 'Task Age (Days)',
    'dependency_count': 'Dependency Count',
    'project_pending_tasks': 'Project Pending Tasks',
    'project_completion_rate': 'Project Completion Rate',
    'historical_user_completion_rate': 'Historical Completion Rate',
    'previous_overdue_count': 'Previous Overdue Count',
    'workload_score': 'Workload Pressure',
    'effort_ratio': 'Effort-to-Time Ratio',
    'dependency_pressure': 'Dependency Pressure',
    'deadline_pressure': 'Deadline Pressure',
    'historical_risk': 'Historical Bottleneck Risk',
}


def parse_calendar_date(val: Any) -> Optional[date]:
    """
    Parses an arbitrary calendar date into a pure Python date object.
    Supports ISO-8601 (YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS), date objects,
    and standard calendar formats without shifting calendar dates due to UTC offsets.
    
    Returns:
        date object if valid.
        None if val is None, empty string, or whitespace.
    
    Raises:
        ValueError: If val is a non-empty string that cannot be parsed as a calendar date.
    """
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()

    val_str = str(val).strip()
    if not val_str:
        return None

    # Handle standard YYYY-MM-DD (fast path & strict verification)
    if len(val_str) == 10 and val_str[4] == '-' and val_str[7] == '-':
        try:
            return date(int(val_str[:4]), int(val_str[5:7]), int(val_str[8:10]))
        except ValueError as err:
            raise ValueError(f"Invalid calendar date '{val_str}': {err}")

    # Handle ISO-8601 with time (T or Z)
    if 'T' in val_str or 'Z' in val_str:
        try:
            clean_str = val_str.replace('Z', '+00:00')
            return datetime.fromisoformat(clean_str).date()
        except (ValueError, TypeError):
            pass

    # Formats with year
    formats_with_year = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%B %d, %Y",
        "%b %d, %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
    ]
    for fmt in formats_with_year:
        try:
            return datetime.strptime(val_str, fmt).date()
        except (ValueError, TypeError):
            continue

    # Formats without year (prepend current calendar year to avoid Python 3.13 deprecation warning)
    formats_no_year = [
        ("%B %d", "%Y %B %d"),
        ("%b %d", "%Y %b %d"),
        ("%d %B", "%Y %d %B"),
        ("%d %b", "%Y %d %b"),
    ]
    current_year = date.today().year
    for _, full_fmt in formats_no_year:
        try:
            return datetime.strptime(f"{current_year} {val_str}", full_fmt).date()
        except (ValueError, TypeError):
            continue

    raise ValueError(
        f"Unable to parse date: '{val_str}'. Expected format YYYY-MM-DD or standard calendar date."
    )


def calculate_days_remaining(
    due_date_raw: Any,
    reference_date: Optional[Union[date, datetime]] = None
) -> Optional[float]:
    """
    Calculates calendar days remaining between reference_date and due_date.
    - Past due date: negative float (e.g. -2.0)
    - Due today: 0.0
    - Future due date: positive float (e.g. 3.0)
    - Missing due date (None or empty): returns None
    - Invalid due date: raises ValueError
    """
    if due_date_raw is None or str(due_date_raw).strip() == '':
        return None

    if reference_date is None:
        ref_d = date.today()
    elif isinstance(reference_date, datetime):
        ref_d = reference_date.date()
    elif isinstance(reference_date, date):
        ref_d = reference_date
    else:
        ref_d = parse_calendar_date(reference_date)

    target_d = parse_calendar_date(due_date_raw)
    if target_d is None:
        return None

    return float((target_d - ref_d).days)


def derive_features_from_task_dict(
    task: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
    reference_date: Optional[Union[date, datetime]] = None
) -> Dict[str, Any]:
    """
    Derives complete numerical features for a single live VoxPlan task.
    Handles arbitrary calendar dates, overdue tasks, missing deadlines,
    and missing estimated effort honestly without hardcoded date heuristics.
    """
    context = context or {}
    ref_d = reference_date.date() if isinstance(reference_date, datetime) else (reference_date or date.today())

    # Priority
    priority_val = task.get('priority')
    priority_str = str(priority_val if priority_val is not None else 'medium').lower()
    priority_map = {'low': 1.0, 'medium': 2.0, 'high': 3.0}
    priority_score = priority_map.get(priority_str, 2.0)

    # Days remaining calculation
    raw_days_rem = task.get('days_remaining')
    if raw_days_rem is not None:
        days_remaining = float(raw_days_rem)
    else:
        raw_due = task.get('dueDate') or task.get('due_date')
        days_remaining = calculate_days_remaining(raw_due, reference_date=ref_d)

    # Effort
    effort_raw = task.get('estimatedEffort') if task.get('estimatedEffort') is not None else task.get('estimated_effort')
    estimated_effort = float(effort_raw) if effort_raw is not None else None

    # Dependencies
    deps_raw = task.get('dependencies') if task.get('dependencies') is not None else task.get('dependency_count')
    if deps_raw is None:
        dependency_count = 0.0
    elif isinstance(deps_raw, list):
        dependency_count = float(len(deps_raw))
    else:
        dependency_count = float(deps_raw)

    # Task age: calculated dynamically from createdAt / created_at if available
    raw_created = task.get('createdAt') or task.get('created_at')
    raw_age = task.get('task_age')
    if raw_age is not None:
        task_age = max(0.0, float(raw_age))
    elif raw_created:
        try:
            created_d = parse_calendar_date(raw_created)
            task_age = max(0.0, float((ref_d - created_d).days)) if created_d else 0.0
        except ValueError:
            task_age = 0.0
    else:
        task_age = 0.0

    # Project Context (from current task board or neutral defaults)
    project_pending_tasks = float(context.get('project_pending_tasks') or task.get('project_pending_tasks') or 4.0)
    project_completion_rate = float(context.get('project_completion_rate') or task.get('project_completion_rate') or 0.65)
    historical_user_completion_rate = float(context.get('historical_user_completion_rate') or task.get('historical_user_completion_rate') or 0.78)
    previous_overdue_count = float(
        context.get('previous_overdue_count')
        if context.get('previous_overdue_count') is not None
        else (task.get('previous_overdue_count') if task.get('previous_overdue_count') is not None else 1.0)
    )

    # Numerical effort proxy for workload and feature vectors
    numeric_effort = estimated_effort if estimated_effort is not None else 4.0

    # Workload score
    workload_score_raw = task.get('workload_score')
    if workload_score_raw is not None:
        workload_score = float(workload_score_raw)
    else:
        workload_score = float(np.clip(
            (project_pending_tasks * 0.4) + (numeric_effort * 0.15) + (previous_overdue_count * 0.5),
            1.0, 10.0
        ))

    # Engineered interaction features
    if days_remaining is not None:
        if days_remaining < 0:
            # Overdue task
            available_hours = 1.0
            deadline_pressure = min(10.0, 3.33 + abs(days_remaining) * 0.5)
        elif days_remaining == 0:
            # Due today
            available_hours = 4.0
            deadline_pressure = 3.33
        else:
            available_hours = max(2.0, days_remaining * 8.0)
            deadline_pressure = float(1.0 / (days_remaining + 0.3))
    else:
        # Flexible task without a hard deadline
        available_hours = 40.0
        deadline_pressure = 0.1

    effort_ratio = float(numeric_effort / available_hours)
    dependency_pressure = float(dependency_count * 1.5 + (1.2 if dependency_count >= 2.0 else 0.0))
    historical_risk = float(previous_overdue_count * 0.8 + (1.0 - historical_user_completion_rate) * 5.0)

    return {
        'priority_score': priority_score,
        'estimated_effort': estimated_effort,
        'days_remaining': days_remaining,
        'task_age': task_age,
        'dependency_count': dependency_count,
        'project_pending_tasks': project_pending_tasks,
        'project_completion_rate': project_completion_rate,
        'historical_user_completion_rate': historical_user_completion_rate,
        'previous_overdue_count': previous_overdue_count,
        'workload_score': round(workload_score, 2),
        'effort_ratio': round(effort_ratio, 3),
        'dependency_pressure': round(dependency_pressure, 3),
        'deadline_pressure': round(deadline_pressure, 3),
        'historical_risk': round(historical_risk, 3),
    }


class VoxPlanFeatureTransformer(BaseEstimator, TransformerMixin):
    """
    Scikit-learn compatible transformer that extracts and engineers VoxPlan features from tabular data.
    """

    def __init__(self):
        self.feature_names_ = FEATURE_NAMES

    def fit(self, X: Union[pd.DataFrame, List[Dict[str, Any]]], y=None):
        return self

    def transform(self, X: Union[pd.DataFrame, List[Dict[str, Any]]]) -> np.ndarray:
        if isinstance(X, pd.DataFrame):
            df = X.copy()
            if 'priority_score' not in df.columns and 'priority' in df.columns:
                p_map = {'low': 1.0, 'medium': 2.0, 'high': 3.0}
                df['priority_score'] = df['priority'].astype(str).str.lower().map(p_map).fillna(2.0)

            if 'effort_ratio' not in df.columns:
                effort = pd.to_numeric(df.get('estimated_effort', 4.0), errors='coerce').fillna(4.0)
                days_rem = pd.to_numeric(df.get('days_remaining', 3.0), errors='coerce').fillna(3.0)
                avail_hours = np.where(days_rem <= 0, 2.0, days_rem * 8.0)
                avail_hours = np.clip(avail_hours, 1.0, None)
                df['effort_ratio'] = effort / avail_hours

            if 'dependency_pressure' not in df.columns:
                deps = pd.to_numeric(df.get('dependency_count', 0.0), errors='coerce').fillna(0.0)
                df['dependency_pressure'] = deps * 1.5 + np.where(deps >= 2, 1.2, 0.0)

            if 'deadline_pressure' not in df.columns:
                days_rem = pd.to_numeric(df.get('days_remaining', 3.0), errors='coerce').fillna(3.0)
                df['deadline_pressure'] = np.where(
                    days_rem < 0,
                    np.clip(3.33 + np.abs(days_rem) * 0.5, 3.33, 10.0),
                    1.0 / np.clip(days_rem + 0.3, 0.3, None)
                )

            if 'historical_risk' not in df.columns:
                prev_overdue = pd.to_numeric(df.get('previous_overdue_count', 1.0), errors='coerce').fillna(1.0)
                user_comp = pd.to_numeric(df.get('historical_user_completion_rate', 0.78), errors='coerce').fillna(0.78)
                df['historical_risk'] = prev_overdue * 0.8 + (1.0 - user_comp) * 5.0

            # Ensure all required features are present
            for col in self.feature_names_:
                if col not in df.columns:
                    df[col] = 0.0

            feature_df = df[self.feature_names_].fillna(0.0)
            return feature_df.values.astype(np.float64)

        elif isinstance(X, list):
            matrix = []
            for item in X:
                derived = derive_features_from_task_dict(item)
                # Ensure null numerical fields default to neutral numbers for sklearn matrix
                row = []
                for col in self.feature_names_:
                    val = derived.get(col)
                    if val is None:
                        if col == 'days_remaining':
                            val = 14.0  # neutral horizon when deadline is unspecified
                        elif col == 'estimated_effort':
                            val = 4.0   # median effort proxy
                        else:
                            val = 0.0
                    row.append(float(val))
                matrix.append(row)
            return np.array(matrix, dtype=np.float64)

        else:
            raise ValueError(f"Unsupported input type for VoxPlanFeatureTransformer: {type(X)}")

    def get_feature_names_out(self, input_features=None) -> List[str]:
        return self.feature_names_

