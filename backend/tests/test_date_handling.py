"""
Comprehensive Test Suite for VoxPlan Unified Date Handling and Calendar Operations.
Tests past dates, today's date, future dates, boundary cases, missing dates, invalid dates,
and timezone independence.
"""

from datetime import date, datetime, timedelta
import numpy as np
import pytest

from backend.ml.features import (
    calculate_days_remaining,
    derive_features_from_task_dict,
    parse_calendar_date,
    VoxPlanFeatureTransformer,
)


def test_parse_calendar_date_iso():
    """Verify ISO-8601 YYYY-MM-DD parsing into pure date object."""
    d = parse_calendar_date("2026-10-25")
    assert d == date(2026, 10, 25)
    assert isinstance(d, date)
    assert not isinstance(d, datetime)


def test_parse_calendar_date_iso_with_time_and_z():
    """Verify ISO strings with T and Z are parsed to date without shifting days."""
    d = parse_calendar_date("2026-10-25T14:30:00Z")
    assert d == date(2026, 10, 25)

    d2 = parse_calendar_date("2026-10-25T23:59:59+05:30")
    assert d2 == date(2026, 10, 25)


def test_parse_calendar_date_common_formats():
    """Verify common human-readable formats parse correctly."""
    assert parse_calendar_date("October 25, 2026") == date(2026, 10, 25)
    assert parse_calendar_date("Oct 25, 2026") == date(2026, 10, 25)
    assert parse_calendar_date("2026/10/25") == date(2026, 10, 25)
    assert parse_calendar_date("25-10-2026") == date(2026, 10, 25)


def test_parse_calendar_date_no_year():
    """Verify formats without year assume the current calendar year."""
    current_year = date.today().year
    assert parse_calendar_date("October 25") == date(current_year, 10, 25)
    assert parse_calendar_date("Oct 25") == date(current_year, 10, 25)


def test_parse_calendar_date_leap_year():
    """Verify leap year valid date (2024-02-29)."""
    assert parse_calendar_date("2024-02-29") == date(2024, 2, 29)


def test_parse_calendar_date_invalid_leap_year():
    """Verify non-leap year (2026-02-29) raises ValueError."""
    with pytest.raises(ValueError):
        parse_calendar_date("2026-02-29")


def test_parse_calendar_date_invalid_strings():
    """Verify non-date and malformed strings raise ValueError instead of guessing."""
    with pytest.raises(ValueError):
        parse_calendar_date("not-a-date")

    with pytest.raises(ValueError):
        parse_calendar_date("2026-13-45")

    with pytest.raises(ValueError):
        parse_calendar_date("tomorrow morning")


def test_parse_calendar_date_none_and_empty():
    """Verify None and empty strings return None."""
    assert parse_calendar_date(None) is None
    assert parse_calendar_date("") is None
    assert parse_calendar_date("   ") is None


def test_calculate_days_remaining_today():
    """Verify due date on the same day as reference_date has 0 days remaining."""
    ref = date(2026, 10, 16)
    days = calculate_days_remaining("2026-10-16", reference_date=ref)
    assert days == 0.0


def test_calculate_days_remaining_future():
    """Verify future due dates return positive calendar day count."""
    ref = date(2026, 10, 16)
    assert calculate_days_remaining("2026-10-17", reference_date=ref) == 1.0
    assert calculate_days_remaining("2026-10-21", reference_date=ref) == 5.0
    assert calculate_days_remaining("2026-11-16", reference_date=ref) == 31.0


def test_calculate_days_remaining_past_overdue():
    """Verify past due dates return negative calendar day count."""
    ref = date(2026, 10, 16)
    assert calculate_days_remaining("2026-10-15", reference_date=ref) == -1.0
    assert calculate_days_remaining("2026-10-10", reference_date=ref) == -6.0


def test_calculate_days_remaining_year_boundary():
    """Verify year-boundary transition (Dec 31 to Jan 1)."""
    ref = date(2026, 12, 31)
    assert calculate_days_remaining("2027-01-01", reference_date=ref) == 1.0
    assert calculate_days_remaining("2026-12-30", reference_date=ref) == -1.0


def test_calculate_days_remaining_missing():
    """Verify missing due date returns None without silently substituting a fixed number."""
    assert calculate_days_remaining(None) is None
    assert calculate_days_remaining("") is None


def test_derive_features_with_arbitrary_dates():
    """Verify derive_features_from_task_dict computes days_remaining and task_age dynamically."""
    ref = date(2026, 10, 16)
    task = {
        'id': 'task-arbitrary',
        'title': 'Deploy new API release',
        'priority': 'high',
        'dueDate': '2026-10-20',
        'createdAt': '2026-10-12T09:00:00Z',
        'estimatedEffort': 6.0,
        'dependencies': ['task-1', 'task-2']
    }
    features = derive_features_from_task_dict(task, reference_date=ref)
    assert features['days_remaining'] == 4.0
    assert features['task_age'] == 4.0
    assert features['priority_score'] == 3.0
    assert features['estimated_effort'] == 6.0
    assert features['dependency_count'] == 2.0
    assert features['deadline_pressure'] == pytest.approx(1.0 / (4.0 + 0.3), abs=1e-2)


def test_derive_features_overdue_task():
    """Verify overdue tasks have high deadline pressure."""
    ref = date(2026, 10, 16)
    task = {
        'id': 'task-overdue',
        'title': 'Audit logs',
        'priority': 'medium',
        'dueDate': '2026-10-14',  # 2 days overdue
    }
    features = derive_features_from_task_dict(task, reference_date=ref)
    assert features['days_remaining'] == -2.0
    assert features['deadline_pressure'] >= 3.33  # elevated pressure for overdue task


def test_derive_features_missing_due_date():
    """Verify tasks without due date have days_remaining=None and minimal deadline pressure."""
    task = {
        'id': 'task-no-deadline',
        'title': 'Explore ideas',
        'priority': 'low',
        'dueDate': None,
    }
    features = derive_features_from_task_dict(task)
    assert features['days_remaining'] is None
    assert features['deadline_pressure'] == 0.1  # nominal low deadline pressure


def test_derive_features_invalid_date_raises():
    """Verify unparseable due dates raise a ValueError rather than falling back to 3 days."""
    task = {
        'id': 'task-invalid',
        'title': 'Bad date task',
        'dueDate': 'invalid-date-string'
    }
    with pytest.raises(ValueError):
        derive_features_from_task_dict(task)


def test_transformer_with_dynamic_dates():
    """Verify VoxPlanFeatureTransformer transforms tasks with various dates into numerical matrix."""
    tasks = [
        {'id': 't1', 'title': 'Task 1', 'dueDate': '2026-10-18', 'estimatedEffort': 3.0},
        {'id': 't2', 'title': 'Task 2', 'dueDate': None, 'estimatedEffort': None},
        {'id': 't3', 'title': 'Task 3', 'days_remaining': 1.0, 'priority': 'high'},
    ]
    transformer = VoxPlanFeatureTransformer()
    matrix = transformer.transform(tasks)
    assert matrix.shape == (3, 14)
    assert not np.isnan(matrix).any()
