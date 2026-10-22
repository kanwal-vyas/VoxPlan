import React, { useState, useEffect, useRef } from 'react';
import {
  exportEncryptedBackup,
  validateAndPreviewBackup,
  restoreBackupData,
} from '../utils/backupManager.js';
import { MIN_PASSWORD_LENGTH } from '../utils/backupCrypto.js';

export default function BackupModal({
  isOpen,
  onClose,
  currentTasks: _currentTasks = [],
  onRestoreSuccess,
}) {
  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'restore'

  // Export State
  const [exportPassword, setExportPassword] = useState('');
  const [exportConfirmPassword, setExportConfirmPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(null);

  // Restore State
  const [selectedFile, setSelectedFile] = useState(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreFeedback, setRestoreFeedback] = useState(null);

  const fileInputRef = useRef(null);

  // Clean state when modal closes
  const handleClose = () => {
    setExportPassword('');
    setExportConfirmPassword('');
    setShowExportPassword(false);
    setIsExporting(false);
    setExportFeedback(null);

    setSelectedFile(null);
    setRestorePassword('');
    setShowRestorePassword(false);
    setIsInspecting(false);
    setIsRestoring(false);
    setRestorePreview(null);
    setRestoreFeedback(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  });

  // Accessible Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Switch tabs cleanly
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setExportFeedback(null);
    setRestoreFeedback(null);
  };

  // Handle Export Submission
  const handleExport = async (e) => {
    e.preventDefault();
    setExportFeedback(null);

    if (exportPassword.length < MIN_PASSWORD_LENGTH) {
      setExportFeedback({
        type: 'error',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
      return;
    }

    if (exportPassword !== exportConfirmPassword) {
      setExportFeedback({
        type: 'error',
        message: 'Password confirmation does not match.',
      });
      return;
    }

    setIsExporting(true);
    try {
      const res = await exportEncryptedBackup(exportPassword, {
        triggerDownload: true,
      });
      setExportFeedback({
        type: 'success',
        message: `Encrypted backup successfully created and downloaded as "${res.filename}". Store your password in a safe password manager.`,
      });
      setExportPassword('');
      setExportConfirmPassword('');
    } catch (err) {
      setExportFeedback({
        type: 'error',
        message: `Export failed: ${err.message}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setRestoreFeedback(null);
    setRestorePreview(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setRestoreFeedback({
        type: 'error',
        message: 'Selected file exceeds maximum allowed size (10 MB).',
      });
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  // Handle Inspect & Decrypt
  const handleInspectBackup = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setRestoreFeedback({ type: 'error', message: 'Please select a backup file (.voxplan or .json).' });
      return;
    }
    if (!restorePassword) {
      setRestoreFeedback({ type: 'error', message: 'Please enter the backup password.' });
      return;
    }

    setIsInspecting(true);
    setRestoreFeedback(null);
    setRestorePreview(null);

    try {
      const res = await validateAndPreviewBackup(selectedFile, restorePassword);
      if (!res.success) {
        setRestoreFeedback({ type: 'error', message: res.message });
        return;
      }

      setRestorePreview(res);
      setRestoreFeedback({
        type: 'info',
        message: 'Backup decrypted and validated successfully. Review the preview below before confirming restore.',
      });
    } catch (err) {
      setRestoreFeedback({
        type: 'error',
        message: `Decryption failed: ${err.message}`,
      });
    } finally {
      setIsInspecting(false);
    }
  };

  // Handle Confirmed Restoration
  const handleConfirmRestore = async () => {
    if (!restorePreview || !restorePreview.validation) return;

    setIsRestoring(true);
    setRestoreFeedback(null);

    try {
      const res = await restoreBackupData(restorePreview.validation, {
        expectedRevision: restorePreview.expectedRevision,
        workspaceFingerprint: restorePreview.workspaceFingerprint,
      });

      if (!res.success) {
        setRestoreFeedback({ type: 'error', message: res.message });
        return;
      }

      setRestoreFeedback({
        type: 'success',
        message: `${res.message} Your workspace has been updated.`,
      });

      if (onRestoreSuccess) {
        onRestoreSuccess(restorePreview.validation.data);
      }

      // Reset preview after success
      setRestorePreview(null);
      setSelectedFile(null);
      setRestorePassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setRestoreFeedback({
        type: 'error',
        message: `Restoration failed: ${err.message}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.backdrop} onClick={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitleRow}>
            <span style={styles.headerIcon}>🔐</span>
            <div>
              <h2 id="backup-modal-title" style={styles.title}>
                Encrypted Workspace Backup
              </h2>
              <p style={styles.subtitle}>
                100% Client-Side AES-GCM Encrypted Data Export & Verified Recovery
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={styles.closeBtn}
            aria-label="Close backup dialog"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div role="tablist" aria-label="Backup actions" style={styles.tabList}>
          <button
            type="button"
            role="tab"
            id="tab-export-backup"
            aria-selected={activeTab === 'export'}
            aria-controls="panel-export-backup"
            onClick={() => handleTabSwitch('export')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'export' ? styles.tabBtnActive : {}),
            }}
          >
            Export Backup
          </button>
          <button
            type="button"
            role="tab"
            id="tab-restore-backup"
            aria-selected={activeTab === 'restore'}
            aria-controls="panel-restore-backup"
            onClick={() => handleTabSwitch('restore')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'restore' ? styles.tabBtnActive : {}),
            }}
          >
            Restore Backup
          </button>
        </div>

        {/* Tab 1: Export Backup */}
        {activeTab === 'export' && (
          <div
            id="panel-export-backup"
            role="tabpanel"
            aria-labelledby="tab-export-backup"
            style={styles.panel}
          >
            {/* Scope explanation */}
            <div style={styles.scopeCard}>
              <h3 style={styles.scopeTitle}>What is included in this backup:</h3>
              <ul style={styles.scopeList}>
                <li>✓ All genuine active and completed tasks with estimates and dependencies</li>
                <li>✓ Accepted sprint schedule and custom time-block availability settings</li>
                <li>✓ Local behavioral habit events and focused timer sessions</li>
                <li>✓ User speech preferences and feedback settings</li>
              </ul>
              <p style={styles.scopeNotice}>
                <strong>Excluded:</strong> In-flight stopwatch state, demo markers, and cached ML calculations.
              </p>
            </div>

            {/* Password Form */}
            <form onSubmit={handleExport} style={styles.form}>
              <div style={styles.formGroup}>
                <label htmlFor="export-backup-password" style={styles.label}>
                  Backup Password (min. 8 characters)
                </label>
                <div style={styles.inputWrapper}>
                  <input
                    id="export-backup-password"
                    type={showExportPassword ? 'text' : 'password'}
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    placeholder="Enter a strong passphrase"
                    required
                    style={styles.input}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowExportPassword((prev) => !prev)}
                    style={styles.togglePasswordBtn}
                    aria-label={showExportPassword ? 'Hide password' : 'Show password'}
                  >
                    {showExportPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="export-backup-confirm-password" style={styles.label}>
                  Confirm Password
                </label>
                <input
                  id="export-backup-confirm-password"
                  type={showExportPassword ? 'text' : 'password'}
                  value={exportConfirmPassword}
                  onChange={(e) => setExportConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  style={styles.input}
                  autoComplete="new-password"
                />
              </div>

              {/* Warning Notice */}
              <div style={styles.warningBox}>
                <span style={styles.warningIcon}>⚠️</span>
                <p style={styles.warningText}>
                  <strong>Zero-Knowledge Security:</strong> Your data is encrypted locally using PBKDF2 (SHA-256) and AES-GCM (256-bit). If you lose this password, this backup <strong>cannot be recovered</strong>. No backdoor exists.
                </p>
              </div>

              {/* Feedback Alert */}
              {exportFeedback && (
                <div
                  role="status"
                  style={{
                    ...styles.feedback,
                    ...(exportFeedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess),
                  }}
                >
                  {exportFeedback.message}
                </div>
              )}

              {/* Action Button */}
              <div style={styles.actionRow}>
                <button
                  type="submit"
                  disabled={isExporting}
                  style={styles.primaryActionBtn}
                >
                  {isExporting ? 'Encrypting & Generating...' : 'Download Encrypted Backup (.voxplan)'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Restore Backup */}
        {activeTab === 'restore' && (
          <div
            id="panel-restore-backup"
            role="tabpanel"
            aria-labelledby="tab-restore-backup"
            style={styles.panel}
          >
            <form onSubmit={handleInspectBackup} style={styles.form}>
              <div style={styles.formGroup}>
                <label htmlFor="restore-backup-file" style={styles.label}>
                  Select Encrypted Backup File (.voxplan or .json)
                </label>
                <input
                  ref={fileInputRef}
                  id="restore-backup-file"
                  type="file"
                  accept=".voxplan,.json,application/json"
                  onChange={handleFileChange}
                  style={styles.fileInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="restore-backup-password" style={styles.label}>
                  Backup Password
                </label>
                <div style={styles.inputWrapper}>
                  <input
                    id="restore-backup-password"
                    type={showRestorePassword ? 'text' : 'password'}
                    value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                    placeholder="Enter the password used during export"
                    required
                    style={styles.input}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRestorePassword((prev) => !prev)}
                    style={styles.togglePasswordBtn}
                    aria-label={showRestorePassword ? 'Hide password' : 'Show password'}
                  >
                    {showRestorePassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Feedback Alert */}
              {restoreFeedback && (
                <div
                  role="status"
                  style={{
                    ...styles.feedback,
                    ...(restoreFeedback.type === 'error'
                      ? styles.feedbackError
                      : restoreFeedback.type === 'info'
                      ? styles.feedbackInfo
                      : styles.feedbackSuccess),
                  }}
                >
                  {restoreFeedback.message}
                </div>
              )}

              {/* Decrypt & Inspect Button */}
              {!restorePreview && (
                <div style={styles.actionRow}>
                  <button
                    type="submit"
                    disabled={isInspecting || !selectedFile || !restorePassword}
                    style={styles.primaryActionBtn}
                  >
                    {isInspecting ? 'Decrypting & Validating...' : 'Decrypt & Inspect Backup'}
                  </button>
                </div>
              )}
            </form>

            {/* Restore Preview Card */}
            {restorePreview && restorePreview.validation && (
              <div style={styles.previewCard}>
                <div style={styles.previewHeader}>
                  <h4 style={styles.previewTitle}>Verified Backup Preview</h4>
                  <span style={styles.verifiedBadge}>✓ Integrity Verified</span>
                </div>

                <div style={styles.previewGrid}>
                  <div style={styles.previewItem}>
                    <span style={styles.previewLabel}>Tasks to Restore:</span>
                    <strong style={styles.previewValue}>
                      {restorePreview.validation.summary.taskCount} ({restorePreview.validation.summary.completedCount} completed, {restorePreview.validation.summary.activeCount} active)
                    </strong>
                  </div>
                  <div style={styles.previewItem}>
                    <span style={styles.previewLabel}>Current Tasks in Workspace:</span>
                    <span style={styles.previewValue}>
                      {restorePreview.validation.summary.currentTaskCount} tasks
                    </span>
                  </div>
                  <div style={styles.previewItem}>
                    <span style={styles.previewLabel}>Sprint Schedule:</span>
                    <span style={styles.previewValue}>
                      {restorePreview.validation.summary.hasAcceptedSchedule ? 'Included' : 'None'}
                    </span>
                  </div>
                  <div style={styles.previewItem}>
                    <span style={styles.previewLabel}>Telemetry & Focus Sessions:</span>
                    <span style={styles.previewValue}>
                      {restorePreview.validation.summary.eventCount} events, {restorePreview.validation.summary.sessionCount} sessions
                    </span>
                  </div>
                  <div style={styles.previewItem}>
                    <span style={styles.previewLabel}>Backup Date:</span>
                    <span style={styles.previewValue}>
                      {new Date(restorePreview.validation.exported_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Warnings List */}
                {restorePreview.validation.warnings && restorePreview.validation.warnings.length > 0 && (
                  <div style={styles.warningListCard}>
                    <strong>Notices:</strong>
                    <ul>
                      {restorePreview.validation.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Overwrite Caution */}
                <div style={styles.restoreCaution}>
                  <p>
                    <strong>Warning:</strong> Restoring will replace your current workspace tasks with the contents of this backup. Existing data will be overwritten.
                  </p>
                </div>

                {/* Confirmation Actions */}
                <div style={styles.confirmActionRow}>
                  <button
                    type="button"
                    onClick={() => setRestorePreview(null)}
                    style={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isRestoring}
                    onClick={handleConfirmRestore}
                    style={styles.confirmRestoreBtn}
                  >
                    {isRestoring ? 'Applying Restoration...' : 'Confirm & Restore Workspace'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(31, 30, 36, 0.45)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    backgroundColor: '#FFF8EF',
    color: '#25242A',
    borderRadius: '16px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '20px 24px 16px 24px',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerIcon: {
    fontSize: '28px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    margin: 0,
    color: '#1F1E24',
    fontFamily: "'Instrument Sans', 'Plus Jakarta Sans', sans-serif",
  },
  subtitle: {
    fontSize: '13px',
    margin: '4px 0 0 0',
    color: '#686571',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#686571',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  tabList: {
    display: 'flex',
    padding: '0 24px',
    gap: '8px',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '12px 16px',
    fontWeight: '600',
    fontSize: '14px',
    color: '#686571',
    cursor: 'pointer',
  },
  tabBtnActive: {
    color: '#1F1E24',
    borderBottom: '3px solid #1F1E24',
  },
  panel: {
    padding: '20px 24px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  scopeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: '10px',
    padding: '14px 16px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    fontSize: '13px',
  },
  scopeTitle: {
    margin: '0 0 8px 0',
    fontSize: '13px',
    fontWeight: '700',
    color: '#1F1E24',
  },
  scopeList: {
    margin: '0 0 8px 0',
    paddingLeft: '18px',
    lineHeight: '1.6',
    color: '#25242A',
  },
  scopeNotice: {
    margin: 0,
    fontSize: '12px',
    color: '#686571',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1F1E24',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
    fontSize: '14px',
    backgroundColor: '#FFFFFF',
    color: '#1F1E24',
  },
  fileInput: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
    fontSize: '13px',
    backgroundColor: '#FFFFFF',
  },
  togglePasswordBtn: {
    position: 'absolute',
    right: '8px',
    background: 'none',
    border: 'none',
    fontSize: '12px',
    color: '#686571',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  warningBox: {
    display: 'flex',
    gap: '10px',
    backgroundColor: '#FFF3E0',
    border: '1px solid #FFE0B2',
    borderRadius: '8px',
    padding: '10px 12px',
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: '16px',
  },
  warningText: {
    margin: 0,
    fontSize: '12px',
    lineHeight: '1.45',
    color: '#6D4C41',
  },
  feedback: {
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    lineHeight: '1.4',
  },
  feedbackError: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
    border: '1px solid #FFCDD2',
  },
  feedbackSuccess: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
    border: '1px solid #C8E6C9',
  },
  feedbackInfo: {
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
    border: '1px solid #BBDEFB',
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '6px',
  },
  primaryActionBtn: {
    backgroundColor: '#1F1E24',
    color: '#FFFFFF',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '10px',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },
  previewCard: {
    marginTop: '12px',
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.15)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    paddingBottom: '8px',
  },
  previewTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '700',
    color: '#1F1E24',
  },
  verifiedBadge: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#2E7D32',
    backgroundColor: '#E8F5E9',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '8px',
    fontSize: '13px',
  },
  previewItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px dashed rgba(37, 36, 42, 0.08)',
  },
  previewLabel: {
    color: '#686571',
  },
  previewValue: {
    fontWeight: '600',
    color: '#1F1E24',
  },
  warningListCard: {
    backgroundColor: '#FFFDE7',
    border: '1px solid #FFF9C4',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#F57F17',
  },
  restoreCaution: {
    backgroundColor: '#FFEBEE',
    border: '1px solid #FFCDD2',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '12px',
    color: '#B71C1C',
  },
  confirmActionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '4px',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(37, 36, 42, 0.2)',
    padding: '10px 16px',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    color: '#686571',
  },
  confirmRestoreBtn: {
    backgroundColor: '#D32F2F',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '8px',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
  },
};
