'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';

const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_URL = (rawApiBaseUrl === undefined ? 'http://localhost:3001' : rawApiBaseUrl).replace(/\/$/, '');

type DocumentStatus =
  | 'Active'
  | 'ExpiringSoon'
  | 'Expired'
  | 'RenewalInProgress'
  | 'Renewed'
  | 'Archived';

type DocumentWorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';

type DocumentConfidentiality = 'public' | 'crew_only' | 'management_only' | 'admin_only';

interface DocumentEvidence {
  id: string;
  fileUrl: string;
  comment?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface DocumentRenewal {
  id: string;
  status: string;
  requestedAt: string;
  completedAt?: string | null;
}

interface YachtDocument {
  id: string;
  yachtId: string;
  title?: string | null;
  docType: string;
  docSubType?: string | null;
  workflowStatus: DocumentWorkflowStatus;
  workflowReason?: string | null;
  confidentiality?: DocumentConfidentiality;
  tags?: string[];
  identifier?: string | null;
  issuedAt?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  status: DocumentStatus;
  assignedToUserId?: string | null;
  createdAt: string;
  updatedAt?: string;
  currentVersion?: DocumentVersion | null;
  evidences: DocumentEvidence[];
  renewals: DocumentRenewal[];
  versions?: DocumentVersion[];
  auditTrail?: DocumentAuditItem[];
}

interface DocumentVersion {
  id: string;
  versionNo: number;
  fileKey?: string | null;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
  note?: string | null;
  uploadedByUserId: string;
  uploadedAt: string;
}

interface DocumentAuditItem {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  source: string;
}

interface UploadResponse {
  fileKey: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string;
  storageProvider?: string;
}

interface DocumentsListResponse {
  items: YachtDocument[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface DocumentSummary {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
  renewalInProgress: number;
  renewed: number;
  archived: number;
  expiringIn30: number;
  expiringIn7?: number;
  pendingApproval?: number;
  drafts?: number;
}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  Active: 'Activo',
  ExpiringSoon: 'Por vencer',
  Expired: 'Vencido',
  RenewalInProgress: 'Renovacion en curso',
  Renewed: 'Renovado',
  Archived: 'Archivado',
};

const WORKFLOW_LABELS: Record<DocumentWorkflowStatus, string> = {
  draft: 'Borrador',
  submitted: 'Pendiente de aprobacion',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  archived: 'Archivado',
};

const CONFIDENTIALITY_LABELS: Record<DocumentConfidentiality, string> = {
  public: 'Publico',
  crew_only: 'Solo tripulacion',
  management_only: 'Solo management',
  admin_only: 'Solo administracion',
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create_document: 'Documento creado',
  update_document: 'Documento actualizado',
  upload_version: 'Nueva version cargada',
  submit_document: 'Documento enviado a aprobacion',
  approve_document: 'Documento aprobado',
  reject_document: 'Documento rechazado',
  archive_document: 'Documento archivado',
  delete_document: 'Documento eliminado',
  add_evidence: 'Evidencia adjuntada',
  start_renewal: 'Renovacion iniciada',
  update_renewal: 'Renovacion actualizada',
};

function StatusBadge({ status }: { status: DocumentStatus }) {
  const color =
    status === 'Active'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Renewed'
        ? 'bg-blue-100 text-blue-700'
        : status === 'ExpiringSoon'
          ? 'bg-amber-100 text-amber-700'
          : status === 'Expired'
            ? 'bg-red-100 text-red-700'
            : status === 'RenewalInProgress'
              ? 'bg-indigo-100 text-indigo-700'
              : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>{STATUS_LABEL[status]}</span>;
}

function WorkflowBadge({ workflowStatus }: { workflowStatus: DocumentWorkflowStatus }) {
  const color =
    workflowStatus === 'approved'
      ? 'bg-emerald-100 text-emerald-700'
      : workflowStatus === 'submitted'
        ? 'bg-amber-100 text-amber-700'
        : workflowStatus === 'rejected'
          ? 'bg-red-100 text-red-700'
          : workflowStatus === 'archived'
            ? 'bg-slate-100 text-slate-700'
            : 'bg-blue-100 text-blue-700';

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>{WORKFLOW_LABELS[workflowStatus]}</span>;
}

export default function YachtDocumentsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const yachtId = String(params.id || '');
  const { currentYacht } = useYacht();
  const { user } = useAuth();

  const [documents, setDocuments] = useState<YachtDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<YachtDocument | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | DocumentStatus>('all');
  const [workflowFilter, setWorkflowFilter] = useState<'all' | DocumentWorkflowStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'submit' | 'approve' | 'reject'>('submit');
  const [reviewDocumentId, setReviewDocumentId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<YachtDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<YachtDocument | null>(null);

  const [form, setForm] = useState({
    title: '',
    docType: '',
    docSubType: '',
    confidentiality: 'crew_only' as DocumentConfidentiality,
    tags: '',
    identifier: '',
    issuedAt: '',
    expiryDate: '',
    notes: '',
  });
  const [createFile, setCreateFile] = useState<File | null>(null);

  const [versionForm, setVersionForm] = useState({
    documentId: '',
    note: '',
  });
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [editForm, setEditForm] = useState({
    documentId: '',
    title: '',
    docType: '',
    docSubType: '',
    confidentiality: 'crew_only' as DocumentConfidentiality,
    tags: '',
    identifier: '',
    issuedAt: '',
    expiryDate: '',
    notes: '',
  });
  const [evidenceForm, setEvidenceForm] = useState({
    documentId: '',
    fileUrl: '',
    comment: '',
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [renewalForm, setRenewalForm] = useState({
    documentId: '',
    renewalId: '',
    nextExpiry: '',
  });

  const role = user?.role || '';
  const canManage = ['Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canApprove = ['Captain', 'Admin', 'SystemAdmin'].includes(role);
  const canDelete = ['Admin', 'SystemAdmin'].includes(role);

  const uploadFile = useCallback(
    async (file: File) =>
      new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/api/uploads`);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = () => {
          setUploadProgress(0);
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
            return;
          }
          try {
            resolve(JSON.parse(xhr.responseText) as UploadResponse);
          } catch {
            reject(new Error('Invalid upload response'));
          }
        };

        xhr.onerror = () => {
          setUploadProgress(0);
          reject(new Error('Upload error'));
        };

        const body = new FormData();
        body.append('file', file);
        xhr.send(body);
      }),
    [],
  );

  const fetchData = useCallback(async () => {
    if (!yachtId) return;
    setIsLoading(true);
    setError(null);
    try {
      const statusQuery = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const workflowQuery = workflowFilter === 'all' ? '' : `&workflowStatus=${workflowFilter}`;
      const [summaryData, docsData] = await Promise.all([
        api.get<DocumentSummary>(`/documents/summary/${encodeURIComponent(yachtId)}`),
        api.get<DocumentsListResponse>(
          `/yachts/${encodeURIComponent(yachtId)}/documents?${statusQuery.replace(/^&/, '')}${workflowQuery}&page=1&pageSize=50`,
        ),
      ]);
      setSummary(summaryData);
      setDocuments(docsData.items || []);
      setDocumentsTotal(docsData.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar documentos');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, workflowFilter, yachtId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDocumentDetail = useCallback(async (documentId: string) => {
    if (!documentId) return;
    try {
      const detail = await api.get<YachtDocument>(`/documents/${encodeURIComponent(documentId)}`);
      setSelectedDocument(detail);
      setShowDetailModal(true);
      setModalError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle del documento');
    }
  }, []);

  useEffect(() => {
    const linkedDocumentId = searchParams.get('documentId');
    if (!linkedDocumentId) return;
    void openDocumentDetail(linkedDocumentId);
  }, [openDocumentDetail, searchParams]);

  const resetForm = () => {
    setForm({
      title: '',
      docType: '',
      docSubType: '',
      confidentiality: 'crew_only',
      tags: '',
      identifier: '',
      issuedAt: '',
      expiryDate: '',
      notes: '',
    });
    setCreateFile(null);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!yachtId) return;

    setSaving(true);
    try {
      let initialVersion: Record<string, unknown> | undefined;
      if (createFile) {
        const uploaded = await uploadFile(createFile);
        initialVersion = {
          fileKey: uploaded.fileKey,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          checksumSha256: uploaded.checksumSha256,
          note: 'Version inicial',
        };
      }

      await api.post(`/yachts/${encodeURIComponent(yachtId)}/documents`, {
        title: form.title.trim(),
        docType: form.docType.trim(),
        docSubType: form.docSubType.trim() || undefined,
        confidentiality: form.confidentiality,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        identifier: form.identifier.trim() || undefined,
        issuedAt: form.issuedAt ? new Date(form.issuedAt).toISOString() : undefined,
        expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : undefined,
        notes: form.notes.trim() || undefined,
        initialVersion,
      });
      setShowCreateModal(false);
      setModalError(null);
      resetForm();
      await fetchData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo crear el documento');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (documentId: string, fn: () => Promise<unknown>) => {
    setActionLoadingId(documentId);
    try {
      await fn();
      await fetchData();
      if (selectedDocument?.id === documentId && showDetailModal) {
        await openDocumentDetail(documentId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo ejecutar la accion';
      if (showDetailModal) {
        setModalError(message);
      } else {
        setError(message);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const openEditModal = (doc: YachtDocument) => {
    setEditForm({
      documentId: doc.id,
      title: doc.title || '',
      docType: doc.docType,
      docSubType: doc.docSubType || '',
      confidentiality: doc.confidentiality || 'crew_only',
      tags: (doc.tags || []).join(', '),
      identifier: doc.identifier || '',
      issuedAt: doc.issuedAt ? doc.issuedAt.slice(0, 10) : '',
      expiryDate: doc.expiryDate ? doc.expiryDate.slice(0, 10) : '',
      notes: doc.notes || '',
    });
    setModalError(null);
    setShowEditModal(true);
  };

  const submitEditDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!editForm.documentId) return;

    setSaving(true);
    setModalError(null);
    try {
      await api.patch(`/documents/${editForm.documentId}`, {
        title: editForm.title.trim(),
        docType: editForm.docType.trim(),
        docSubType: editForm.docSubType.trim() || undefined,
        confidentiality: editForm.confidentiality,
        tags: editForm.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        identifier: editForm.identifier.trim() || undefined,
        issuedAt: editForm.issuedAt ? new Date(editForm.issuedAt).toISOString() : '',
        expiryDate: editForm.expiryDate ? new Date(editForm.expiryDate).toISOString() : '',
        notes: editForm.notes.trim() || undefined,
      });
      setShowEditModal(false);
      await fetchData();
      if (showDetailModal && selectedDocument?.id === editForm.documentId) {
        await openDocumentDetail(editForm.documentId);
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo actualizar el documento');
    } finally {
      setSaving(false);
    }
  };

  const openEvidenceModal = (doc: YachtDocument) => {
    setEvidenceForm({
      documentId: doc.id,
      fileUrl: '',
      comment: '',
    });
    setEvidenceFile(null);
    setModalError(null);
    setShowEvidenceModal(true);
  };

  const handleStartRenewal = (doc: YachtDocument) => {
    void runAction(doc.id, () => api.post(`/documents/${doc.id}/renewals`, {}));
  };

  const openCompleteRenewalModal = (doc: YachtDocument) => {
    const inProgress = doc.renewals.find((item) => item.status === 'IN_PROGRESS');
    if (!inProgress) {
      setError('No hay renovacion en progreso para este documento.');
      return;
    }
    setRenewalForm({
      documentId: doc.id,
      renewalId: inProgress.id,
      nextExpiry: doc.expiryDate ? doc.expiryDate.slice(0, 10) : '',
    });
    setModalError(null);
    setShowRenewalModal(true);
  };

  const submitEvidence = async (event: FormEvent) => {
    event.preventDefault();
    if (!evidenceForm.documentId) return;

    setSaving(true);
    setModalError(null);
    try {
      let fileUrl = evidenceForm.fileUrl.trim();

      if (evidenceFile) {
        const uploaded = await uploadFile(evidenceFile);
        fileUrl = uploaded.fileUrl;
      }

      if (!fileUrl) {
        setModalError('Sube un archivo o ingresa un enlace de evidencia.');
        return;
      }

      await api.post(`/documents/${evidenceForm.documentId}/evidences`, {
        fileUrl,
        comment: evidenceForm.comment.trim() || undefined,
      });
      setShowEvidenceModal(false);
      setEvidenceFile(null);
      await fetchData();
      if (showDetailModal && selectedDocument?.id === evidenceForm.documentId) {
        await openDocumentDetail(evidenceForm.documentId);
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo adjuntar la evidencia');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const submitCompleteRenewal = async (event: FormEvent) => {
    event.preventDefault();
    if (!renewalForm.documentId || !renewalForm.renewalId || !renewalForm.nextExpiry) {
      setModalError('Debes seleccionar la nueva fecha de vencimiento.');
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      await api.patch(`/documents/${renewalForm.documentId}/renewals/${renewalForm.renewalId}`, {
        status: 'COMPLETED',
        newExpiryDate: new Date(renewalForm.nextExpiry).toISOString(),
      });
      setShowRenewalModal(false);
      await fetchData();
      if (showDetailModal && selectedDocument?.id === renewalForm.documentId) {
        await openDocumentDetail(renewalForm.documentId);
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo completar la renovacion');
    } finally {
      setSaving(false);
    }
  };

  const openVersionModal = (documentId: string) => {
    setVersionForm({
      documentId,
      note: '',
    });
    setVersionFile(null);
    setModalError(null);
    setShowVersionModal(true);
  };

  const submitVersion = async (event: FormEvent) => {
    event.preventDefault();
    if (!versionForm.documentId) return;
    if (!versionFile) {
      setModalError('Debe seleccionar un archivo');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const uploaded = await uploadFile(versionFile);
      await api.post(`/documents/${versionForm.documentId}/versions`, {
        fileKey: uploaded.fileKey,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        checksumSha256: uploaded.checksumSha256,
        note: versionForm.note.trim() || undefined,
      });
      setShowVersionModal(false);
      setModalError(null);
      await fetchData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo subir la version');
    } finally {
      setSaving(false);
    }
  };

  const openReviewModal = (documentId: string, action: 'submit' | 'approve' | 'reject') => {
    setReviewDocumentId(documentId);
    setReviewAction(action);
    setReviewReason('');
    setModalError(null);
    setShowReviewModal(true);
  };

  const submitReviewAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!reviewDocumentId) return;

    setSaving(true);
    setModalError(null);
    try {
      if (reviewAction === 'submit') {
        await api.post(`/documents/${reviewDocumentId}/submit`, { reason: reviewReason.trim() });
      } else if (reviewAction === 'approve') {
        await api.post(`/documents/${reviewDocumentId}/approve`, { reason: reviewReason.trim() });
      } else {
        await api.post(`/documents/${reviewDocumentId}/reject`, { reason: reviewReason.trim() });
      }
      setShowReviewModal(false);
      await fetchData();
      await openDocumentDetail(reviewDocumentId);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo completar la accion');
    } finally {
      setSaving(false);
    }
  };

  const confirmArchiveDocument = () => {
    if (!archiveTarget) return;
    const documentId = archiveTarget.id;
    setArchiveTarget(null);
    void runAction(documentId, () => api.post(`/documents/${documentId}/archive`, {}));
  };

  const confirmDeleteDocument = () => {
    if (!deleteTarget) return;
    const documentId = deleteTarget.id;
    setDeleteTarget(null);
    void runAction(documentId, async () => {
      await api.delete(`/documents/${documentId}`);
      if (selectedDocument?.id === documentId) {
        setShowDetailModal(false);
        setSelectedDocument(null);
      }
    });
  };

  const renderDocumentActions = (doc: YachtDocument, compact = false) => (
    <div className={`flex flex-wrap gap-2 ${compact ? 'pt-1' : ''}`}>
      <button
        type="button"
        onClick={() => void openDocumentDetail(doc.id)}
        disabled={actionLoadingId === doc.id}
        className="btn-secondary !px-3 !py-1.5 !text-xs"
      >
        Detalle
      </button>
      {canManage && doc.status !== 'Archived' && (
        <>
          <button
            type="button"
            onClick={() => openEditModal(doc)}
            disabled={actionLoadingId === doc.id}
            className="btn-secondary !px-3 !py-1.5 !text-xs"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => openVersionModal(doc.id)}
            disabled={actionLoadingId === doc.id}
            className="btn-primary !px-3 !py-1.5 !text-xs"
          >
            Nueva version
          </button>
          <button
            type="button"
            onClick={() => openEvidenceModal(doc)}
            disabled={actionLoadingId === doc.id}
            className="btn-secondary !px-3 !py-1.5 !text-xs"
          >
            Evidencia
          </button>
          {doc.status !== 'RenewalInProgress' && (
            <button
              type="button"
              onClick={() => handleStartRenewal(doc)}
              disabled={actionLoadingId === doc.id}
              className="btn-primary !px-3 !py-1.5 !text-xs"
            >
              Iniciar renovacion
            </button>
          )}
          {doc.status === 'RenewalInProgress' && (
            <button
              type="button"
              onClick={() => openCompleteRenewalModal(doc)}
              disabled={actionLoadingId === doc.id}
              className="btn-primary !px-3 !py-1.5 !text-xs"
            >
              Completar renovacion
            </button>
          )}
          {doc.workflowStatus === 'draft' && (
            <button
              type="button"
              onClick={() => openReviewModal(doc.id, 'submit')}
              disabled={actionLoadingId === doc.id}
              className="btn-primary !px-3 !py-1.5 !text-xs"
            >
              Enviar
            </button>
          )}
          {canApprove && doc.workflowStatus === 'submitted' && (
            <>
              <button
                type="button"
                onClick={() => openReviewModal(doc.id, 'approve')}
                disabled={actionLoadingId === doc.id}
                className="btn-primary !px-3 !py-1.5 !text-xs"
              >
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => openReviewModal(doc.id, 'reject')}
                disabled={actionLoadingId === doc.id}
                className="btn-danger !px-3 !py-1.5 !text-xs"
              >
                Rechazar
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setArchiveTarget(doc);
              setModalError(null);
            }}
            disabled={actionLoadingId === doc.id}
            className="btn-danger !px-3 !py-1.5 !text-xs"
          >
            Archivar
          </button>
          {canDelete && doc.workflowStatus !== 'approved' && doc.workflowStatus !== 'submitted' && (
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(doc);
                setModalError(null);
              }}
              disabled={actionLoadingId === doc.id}
              className="btn-danger !px-3 !py-1.5 !text-xs"
            >
              Eliminar
            </button>
          )}
        </>
      )}
    </div>
  );

  if (isLoading && documents.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-text-secondary">Cargando documentos...</div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Documentos {currentYacht ? `- ${currentYacht.name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Control documental, vencimientos, renovaciones y evidencias por yate.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setModalError(null);
              setShowCreateModal(true);
            }}
            className="btn-primary"
          >
            Nuevo documento
          </button>
        )}
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="kpi-row-mobile">
        <div className="kpi-card">
          <p className="kpi-label">Total</p>
          <p className="kpi-value">{documentsTotal || summary?.total || 0}</p>
        </div>
        <div className="kpi-card kpi-card-warning">
          <p className="kpi-label">Por vencer</p>
          <p className="kpi-value text-amber-300">{summary?.expiringSoon || 0}</p>
        </div>
        <div className="kpi-card kpi-card-danger">
          <p className="kpi-label">Vencidos</p>
          <p className="kpi-value text-red-300">{summary?.expired || 0}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Renovacion en curso</p>
          <p className="kpi-value text-indigo-400">{summary?.renewalInProgress || 0}</p>
        </div>
        <div className="kpi-card kpi-card-warning">
          <p className="kpi-label">Pendientes aprobacion</p>
          <p className="kpi-value text-amber-300">{summary?.pendingApproval || 0}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Borradores</p>
          <p className="kpi-value text-blue-400">{summary?.drafts || 0}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-text-secondary" htmlFor="documentStatusFilter">
          Estado
        </label>
        <select
          id="documentStatusFilter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | DocumentStatus)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          <option value="all">Todos</option>
          <option value="Active">Activo</option>
          <option value="ExpiringSoon">Por vencer</option>
          <option value="Expired">Vencido</option>
          <option value="RenewalInProgress">Renovacion en curso</option>
          <option value="Renewed">Renovado</option>
          <option value="Archived">Archivado</option>
        </select>
        <label className="text-sm text-text-secondary" htmlFor="documentWorkflowFilter">
          Flujo
        </label>
        <select
          id="documentWorkflowFilter"
          value={workflowFilter}
          onChange={(event) => setWorkflowFilter(event.target.value as 'all' | DocumentWorkflowStatus)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          <option value="all">Todos</option>
          <option value="draft">Borrador</option>
          <option value="submitted">Pendiente</option>
          <option value="approved">Aprobado</option>
          <option value="rejected">Rechazado</option>
          <option value="archived">Archivado</option>
        </select>
      </div>

      <div className="space-y-3 md:hidden">
        {documents.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm font-medium text-text-primary">No hay documentos con este filtro</p>
            <p className="mt-1 text-xs text-text-secondary">Ajusta los filtros o crea el primer documento del yate.</p>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setModalError(null);
                  setShowCreateModal(true);
                }}
                className="btn-primary mt-4"
              >
                Crear primer documento
              </button>
            )}
          </div>
        ) : (
          documents.map((doc) => (
            <article key={doc.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{doc.title || doc.docType}</p>
                  <p className="text-xs text-text-secondary">{doc.docType}</p>
                </div>
                <span className="text-xs text-text-secondary">v{doc.currentVersion?.versionNo || 0}</span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status={doc.status} />
                <WorkflowBadge workflowStatus={doc.workflowStatus} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border bg-background px-2 py-1.5">
                  <p className="text-text-secondary">Vence</p>
                  <p className="mt-0.5 font-medium text-text-primary">
                    {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : '-'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background px-2 py-1.5">
                  <p className="text-text-secondary">Evidencias</p>
                  <p className="mt-0.5 font-medium text-text-primary">{doc.evidences.length}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void openDocumentDetail(doc.id)}
                disabled={actionLoadingId === doc.id}
                className="btn-secondary mt-3 w-full"
              >
                Ver detalle y acciones
              </button>
            </article>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-hover text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">Documento</th>
              <th className="px-4 py-3 text-left">Identificador</th>
              <th className="px-4 py-3 text-left">Vence</th>
              <th className="px-4 py-3 text-left">Estado operativo</th>
              <th className="px-4 py-3 text-left">Flujo</th>
              <th className="px-4 py-3 text-left">Version</th>
              <th className="px-4 py-3 text-left">Evidencias</th>
              <th className="px-4 py-3 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-secondary">
                  No hay documentos para este filtro.
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{doc.title || doc.docType}</p>
                    <p className="text-xs text-text-secondary">{doc.docType}</p>
                    {doc.notes && <p className="text-xs text-text-secondary">{doc.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{doc.identifier || '-'}</td>
                  <td className="px-4 py-3 text-text-primary">
                    {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-4 py-3">
                    <WorkflowBadge workflowStatus={doc.workflowStatus} />
                  </td>
                  <td className="px-4 py-3 text-text-primary">v{doc.currentVersion?.versionNo || 0}</td>
                  <td className="px-4 py-3 text-text-primary">{doc.evidences.length}</td>
                  <td className="px-4 py-3">{renderDocumentActions(doc)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Nuevo documento</h2>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              {modalError && (
                <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Titulo</label>
                <input
                  required
                  minLength={3}
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="input"
                  placeholder="Ej: Certificado de navegabilidad"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Tipo documental</label>
                <input
                  required
                  value={form.docType}
                  onChange={(event) => setForm((prev) => ({ ...prev, docType: event.target.value }))}
                  className="input"
                  placeholder="Ej: Registro de bandera"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Subtipo</label>
                  <input
                    value={form.docSubType}
                    onChange={(event) => setForm((prev) => ({ ...prev, docSubType: event.target.value }))}
                    className="input"
                    placeholder="Ej: Certificado anual"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Confidencialidad</label>
                  <select
                    value={form.confidentiality}
                    onChange={(event) => setForm((prev) => ({ ...prev, confidentiality: event.target.value as DocumentConfidentiality }))}
                    className="input"
                  >
                    <option value="public">Publico</option>
                    <option value="crew_only">Solo tripulacion</option>
                    <option value="management_only">Solo management</option>
                    <option value="admin_only">Solo admin</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Tags (separados por coma)</label>
                <input
                  value={form.tags}
                  onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                  className="input"
                  placeholder="certificados, puerto, legal"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Identificador</label>
                <input
                  value={form.identifier}
                  onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
                  className="input"
                  placeholder="Ej: REG-2026-001"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Fecha de emision</label>
                  <input
                    type="date"
                    value={form.issuedAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, issuedAt: event.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, expiryDate: event.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  className="input"
                  rows={3}
                />
              </div>
              <div className="rounded-lg border border-border bg-surface-hover p-3">
                <p className="mb-2 text-sm font-medium text-text-primary">Version inicial (opcional)</p>
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">Archivo</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                    onChange={(event) => setCreateFile(event.target.files?.[0] || null)}
                    className="input"
                  />
                </div>
                {createFile && (
                  <p className="mt-2 text-xs text-text-secondary">
                    {createFile.name} - {(createFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
                {uploadProgress > 0 && (
                  <p className="mt-2 text-xs text-info">Subiendo archivo: {uploadProgress}%</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? 'Guardando...' : 'Crear documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Subir nueva version</h2>
            <form className="mt-4 space-y-4" onSubmit={submitVersion}>
              {modalError && (
                <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Archivo</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                  required
                  onChange={(event) => setVersionFile(event.target.files?.[0] || null)}
                  className="input"
                />
              </div>
              {versionFile && (
                <p className="text-xs text-text-secondary">
                  {versionFile.name} - {(versionFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              )}
              {uploadProgress > 0 && (
                <p className="text-xs text-info">Subiendo archivo: {uploadProgress}%</p>
              )}
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Nota</label>
                <textarea
                  value={versionForm.note}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, note: event.target.value }))}
                  className="input"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? 'Guardando...' : 'Subir version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">
              {reviewAction === 'submit'
                ? 'Enviar documento'
                : reviewAction === 'approve'
                  ? 'Aprobar documento'
                  : 'Rechazar documento'}
            </h2>
            <form className="mt-4 space-y-4" onSubmit={submitReviewAction}>
              {modalError && (
                <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Motivo</label>
                <textarea
                  required
                  minLength={3}
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Detalle el motivo para auditoria"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? 'Procesando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Editar documento</h2>
            <p className="mt-1 text-sm text-text-secondary">Actualiza los datos clave y fechas del documento.</p>
            <form className="mt-4 space-y-4" onSubmit={submitEditDocument}>
              {modalError && (
                <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Titulo</label>
                  <input
                    required
                    minLength={3}
                    value={editForm.title}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Tipo documental</label>
                  <input
                    required
                    value={editForm.docType}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, docType: event.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Subtipo</label>
                  <input
                    value={editForm.docSubType}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, docSubType: event.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Confidencialidad</label>
                  <select
                    value={editForm.confidentiality}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, confidentiality: event.target.value as DocumentConfidentiality }))
                    }
                    className="input"
                  >
                    <option value="public">Publico</option>
                    <option value="crew_only">Solo tripulacion</option>
                    <option value="management_only">Solo management</option>
                    <option value="admin_only">Solo admin</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Identificador</label>
                  <input
                    value={editForm.identifier}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, identifier: event.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Tags (coma)</label>
                  <input
                    value={editForm.tags}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Fecha de emision</label>
                  <input
                    type="date"
                    value={editForm.issuedAt}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, issuedAt: event.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={editForm.expiryDate}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, expiryDate: event.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Notas</label>
                <textarea
                  value={editForm.notes}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={3}
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEvidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Agregar evidencia</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Adjunta un archivo o pega un enlace para respaldar este documento.
            </p>
            <form className="mt-4 space-y-4" onSubmit={submitEvidence}>
              {modalError && (
                <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div className="rounded-lg border border-border bg-surface-hover p-3">
                <label className="mb-1 block text-sm text-text-secondary">Archivo (opcional)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)}
                  className="input"
                />
                {evidenceFile && (
                  <p className="mt-2 text-xs text-text-secondary">
                    {evidenceFile.name} - {(evidenceFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
                {uploadProgress > 0 && (
                  <p className="mt-2 text-xs text-info">Subiendo archivo: {uploadProgress}%</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Enlace de evidencia (opcional)</label>
                <input
                  type="url"
                  value={evidenceForm.fileUrl}
                  onChange={(event) => setEvidenceForm((prev) => ({ ...prev, fileUrl: event.target.value }))}
                  className="input"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Comentario</label>
                <textarea
                  rows={3}
                  value={evidenceForm.comment}
                  onChange={(event) => setEvidenceForm((prev) => ({ ...prev, comment: event.target.value }))}
                  className="input"
                  placeholder="Ej: Evidencia tomada durante inspeccion de puerto."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowEvidenceModal(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : 'Guardar evidencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRenewalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Completar renovacion</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Define la nueva fecha de vencimiento para cerrar la renovacion.
            </p>
            <form className="mt-4 space-y-4" onSubmit={submitCompleteRenewal}>
              {modalError && (
                <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Nueva fecha de vencimiento</label>
                <input
                  type="date"
                  required
                  value={renewalForm.nextExpiry}
                  onChange={(event) => setRenewalForm((prev) => ({ ...prev, nextExpiry: event.target.value }))}
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowRenewalModal(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Procesando...' : 'Completar renovacion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Archivar documento</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Vas a archivar <span className="font-semibold text-text-primary">{archiveTarget.title || archiveTarget.docType}</span>.
              Esta accion mantiene el historial pero lo saca del flujo activo.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setArchiveTarget(null)} className="btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={confirmArchiveDocument} className="btn-danger">
                Confirmar archivo
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Eliminar documento</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Esta accion eliminara de forma permanente{' '}
              <span className="font-semibold text-text-primary">{deleteTarget.title || deleteTarget.docType}</span> y no se puede deshacer.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={confirmDeleteDocument} className="btn-danger">
                Eliminar documento
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedDocument && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-surface sm:max-h-[90vh] sm:max-w-5xl sm:rounded-xl sm:border sm:border-border sm:shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-text-primary">{selectedDocument.title || selectedDocument.docType}</h2>
                <p className="text-sm text-text-secondary">{selectedDocument.docType}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                aria-label="Cerrar detalle"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {modalError && (
                <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-text-secondary">Estado operativo</p>
                  <div className="mt-1">
                    <StatusBadge status={selectedDocument.status} />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-text-secondary">Flujo</p>
                  <div className="mt-1">
                    <WorkflowBadge workflowStatus={selectedDocument.workflowStatus} />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-text-secondary">Confidencialidad</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {CONFIDENTIALITY_LABELS[selectedDocument.confidentiality || 'crew_only']}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-3">
                  <h3 className="text-sm font-semibold text-text-primary">Datos del documento</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-text-secondary">Identificador</dt>
                      <dd className="text-right text-text-primary">{selectedDocument.identifier || '-'}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-text-secondary">Fecha emision</dt>
                      <dd className="text-right text-text-primary">
                        {selectedDocument.issuedAt ? new Date(selectedDocument.issuedAt).toLocaleDateString() : '-'}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-text-secondary">Fecha vencimiento</dt>
                      <dd className="text-right text-text-primary">
                        {selectedDocument.expiryDate ? new Date(selectedDocument.expiryDate).toLocaleDateString() : '-'}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-text-secondary">Version actual</dt>
                      <dd className="text-right text-text-primary">v{selectedDocument.currentVersion?.versionNo || 0}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-text-secondary">Renovaciones</dt>
                      <dd className="text-right text-text-primary">{selectedDocument.renewals.length}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <h3 className="text-sm font-semibold text-text-primary">Notas y clasificacion</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-text-secondary">
                      <span className="font-semibold text-text-primary">Tipo:</span> {selectedDocument.docType}
                      {selectedDocument.docSubType ? ` / ${selectedDocument.docSubType}` : ''}
                    </p>
                    <p className="text-text-secondary">
                      <span className="font-semibold text-text-primary">Tags:</span>{' '}
                      {selectedDocument.tags && selectedDocument.tags.length > 0 ? selectedDocument.tags.join(', ') : '-'}
                    </p>
                    <p className="text-text-secondary">
                      <span className="font-semibold text-text-primary">Notas:</span>{' '}
                      {selectedDocument.notes?.trim() ? selectedDocument.notes : 'Sin notas registradas.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Acciones disponibles</p>
                <div className="mt-2">{renderDocumentActions(selectedDocument, true)}</div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-3">
                  <h3 className="text-sm font-semibold text-text-primary">Versiones</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {(selectedDocument.versions || []).length === 0 ? (
                      <li className="text-text-secondary">Sin versiones</li>
                    ) : (
                      (selectedDocument.versions || []).map((version) => (
                        <li key={version.id} className="rounded border border-border bg-surface p-2">
                          <p className="font-medium text-text-primary">v{version.versionNo} - {version.fileName}</p>
                          <p className="text-xs text-text-secondary">{new Date(version.uploadedAt).toLocaleString()}</p>
                          <div className="mt-1 flex gap-3">
                            <a className="text-xs text-info hover:underline" href={version.fileUrl} target="_blank" rel="noreferrer">
                              Ver
                            </a>
                            <a
                              className="text-xs text-info hover:underline"
                              href={version.fileUrl.includes('/api/uploads/files/')
                                ? `${version.fileUrl}${version.fileUrl.includes('?') ? '&' : '?'}download=1`
                                : version.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Descargar
                            </a>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div className="rounded-lg border border-border bg-background p-3">
                  <h3 className="text-sm font-semibold text-text-primary">Evidencias</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {selectedDocument.evidences.length === 0 ? (
                      <li className="text-text-secondary">Sin evidencias registradas</li>
                    ) : (
                      selectedDocument.evidences.map((evidence) => (
                        <li key={evidence.id} className="rounded border border-border bg-surface p-2">
                          <a className="font-medium text-info hover:underline" href={evidence.fileUrl} target="_blank" rel="noreferrer">
                            Abrir evidencia
                          </a>
                          <p className="mt-1 text-xs text-text-secondary">
                            Cargada por {evidence.uploadedBy} · {new Date(evidence.uploadedAt).toLocaleString()}
                          </p>
                          <p className="text-xs text-text-secondary">{evidence.comment?.trim() || 'Sin comentario.'}</p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <h3 className="text-sm font-semibold text-text-primary">Auditoria</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {(selectedDocument.auditTrail || []).length === 0 ? (
                    <li className="text-text-secondary">Sin registros de auditoria</li>
                  ) : (
                    (selectedDocument.auditTrail || []).map((audit) => (
                      <li key={audit.id} className="rounded border border-border bg-surface p-2">
                        <p className="font-medium text-text-primary">{AUDIT_ACTION_LABELS[audit.action] || audit.action}</p>
                        <p className="text-xs text-text-secondary">
                          {audit.actorName} - {new Date(audit.timestamp).toLocaleString()}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
