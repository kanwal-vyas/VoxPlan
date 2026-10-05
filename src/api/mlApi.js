/**
 * VoxPlan Machine Learning API Client.
 * Connects the React frontend to the local FastAPI ML backend.
 */

const API_BASE_URL = 'http://127.0.0.1:8000';

export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, data };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

export async function getModelStatus() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/model/status`, { method: 'GET' });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch model status from backend:', err);
    return { is_trained: false, message: 'ML backend is not reachable or model untrained.' };
  }
}

export async function trainModel(numSamples = 1200, randomSeed = 42) {
  const res = await fetch(`${API_BASE_URL}/api/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ num_samples: numSamples, random_seed: randomSeed }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Training request failed.');
  }
  return await res.json();
}

export async function getFeatureImportance() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/feature-importance`, { method: 'GET' });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch feature importance:', err);
    return { is_trained: false, feature_importances: [] };
  }
}

export async function predictSingleTask(task) {
  const res = await fetch(`${API_BASE_URL}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Prediction failed.');
  }
  return await res.json();
}

export async function predictBatchTasks(tasks, context = null) {
  const res = await fetch(`${API_BASE_URL}/api/predict/all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks, context }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Batch prediction failed.');
  }
  return await res.json();
}
