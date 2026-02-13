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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cargar el detalle del documento');
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
      resetForm();
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo crear el documento');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (documentId: string, fn: () => Promise<unknown>) => {
    setActionLoadingId(documentId);
    try {
      await fn();
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo ejecutar la accion');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEditExpiry = (doc: YachtDocument) => {
    const value = window.prompt(
      'Nueva fecha de vencimiento (YYYY-MM-DD, dejar vacio para quitar)',
      doc.expiryDate ? doc.expiryDate.slice(0, 10) : '',
    );
    if (value === null) return;
    void runAction(doc.id, () =>
      api.patch(`/documents/${doc.id}`, {
        expiryDate: value.trim() === '' ? '' : new Date(value).toISOString(),
      }),
    );
  };

  const handleArchive = (doc: YachtDocument) => {
    const confirmed = window.confirm(`Archivar documento "${doc.docType}"?`);
    if (!confirmed) return;
    void runAction(doc.id, () => api.post(`/documents/${doc.id}/archive`, {}));
  };

  const handleAddEvidence = (doc: YachtDocument) => {
    const fileUrl = window.prompt('URL del archivo de evidencia');
    if (!fileUrl || fileUrl.trim() === '') return;
    const comment = window.prompt('Comentario (opcional)') || '';
    void runAction(doc.id, () =>
      api.post(`/documents/${doc.id}/evidences`, {
        fileUrl: fileUrl.trim(),
        comment: comment.trim() || undefined,
      }),
    );
  };

  const handleStartRenewal = (doc: YachtDocument) => {
    void runAction(doc.id, () => api.post(`/documents/${doc.id}/renewals`, {}));
  };

  const handleCompleteRenewal = (doc: YachtDocument) => {
    const inProgress = doc.renewals.find((item) => item.status === 'IN_PROGRESS');
    if (!inProgress) {
      alert('No hay renovacion en progreso para este documento.');
      return;
    }
    const nextExpiry = window.prompt('Nueva fecha de vencimiento (YYYY-MM-DD)', doc.expiryDate ? doc.expiryDate.slice(0, 10) : '');
    if (!nextExpiry || nextExpiry.trim() === '') return;

    void runAction(doc.id, () =>
      api.patch(`/documents/${doc.id}/renewals/${inProgress.id}`, {
        status: 'COMPLETED',
        newExpiryDate: new Date(nextExpiry).toISOString(),
      }),
    );
  };

  const openVersionModal = (documentId: string) => {
    setVersionForm({
      documentId,
      note: '',
    });
    setVersionFile(null);
    setShowVersionModal(true);
  };

  const submitVersion = async (event: FormEvent) => {
    event.preventDefault();
    if (!versionForm.documentId) return;
    if (!versionFile) {
      alert('Debe seleccionar un archivo');
      return;
    }
    setSaving(true);
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
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo subir la version');
    } finally {
      setSaving(false);
    }
  };

  const openReviewModal = (documentId: string, action: 'submit' | 'approve' | 'reject') => {
    setReviewDocumentId(documentId);
    setReviewAction(action);
    setReviewReason('');
    setShowReviewModal(true);
  };

  const submitReviewAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!reviewDocumentId) return;

    setSaving(true);
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
      alert(err instanceof Error ? err.message : 'No se pudo completar la accion');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (doc: YachtDocument) => {
    const confirmed = window.confirm(`Eliminar documento "${doc.title || doc.docType}"? Esta accion no se puede deshacer.`);
    if (!confirmed) return;
    void runAction(doc.id, () => api.delete(`/documents/${doc.id}`));
  };

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
              setShowCreateModal(true);
            }}
            className="rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Nuevo documento
          </button>
        )}
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="kpi-grid">
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

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
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
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void openDocumentDetail(doc.id)}
                        disabled={actionLoadingId === doc.id}
                        className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                      >
                        Detalle
                      </button>
                      {canManage && doc.status !== 'Archived' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEditExpiry(doc)}
                            disabled={actionLoadingId === doc.id}
                            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => openVersionModal(doc.id)}
                            disabled={actionLoadingId === doc.id}
                            className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                          >
                            Nueva version
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddEvidence(doc)}
                            disabled={actionLoadingId === doc.id}
                            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                          >
                            Evidencia
                          </button>
                          {doc.status !== 'RenewalInProgress' && (
                            <button
                              type="button"
                              onClick={() => handleStartRenewal(doc)}
                              disabled={actionLoadingId === doc.id}
                              className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                            >
                              Iniciar renovacion
                            </button>
                          )}
                          {doc.status === 'RenewalInProgress' && (
                            <button
                              type="button"
                              onClick={() => handleCompleteRenewal(doc)}
                              disabled={actionLoadingId === doc.id}
                              className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                            >
                              Completar renovacion
                            </button>
                          )}
                          {doc.workflowStatus === 'draft' && (
                            <button
                              type="button"
                              onClick={() => openReviewModal(doc.id, 'submit')}
                              disabled={actionLoadingId === doc.id}
                              className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
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
                                className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                              >
                                Aprobar
                              </button>
                              <button
                                type="button"
                                onClick={() => openReviewModal(doc.id, 'reject')}
                                disabled={actionLoadingId === doc.id}
                                className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleArchive(doc)}
                            disabled={actionLoadingId === doc.id}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            Archivar
                          </button>
                          {canDelete && doc.workflowStatus !== 'approved' && doc.workflowStatus !== 'submitted' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(doc)}
                              disabled={actionLoadingId === doc.id}
                              className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            >
                              Eliminar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Nuevo documento</h2>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Titulo</label>
                <input
                  required
                  minLength={3}
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Ej: Certificado de navegabilidad"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Tipo documental</label>
                <input
                  required
                  value={form.docType}
                  onChange={(event) => setForm((prev) => ({ ...prev, docType: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Ej: Registro de bandera"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-gray-700">Subtipo</label>
                  <input
                    value={form.docSubType}
                    onChange={(event) => setForm((prev) => ({ ...prev, docSubType: event.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Ej: Certificado anual"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-700">Confidencialidad</label>
                  <select
                    value={form.confidentiality}
                    onChange={(event) => setForm((prev) => ({ ...prev, confidentiality: event.target.value as DocumentConfidentiality }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="public">Publico</option>
                    <option value="crew_only">Solo tripulacion</option>
                    <option value="management_only">Solo management</option>
                    <option value="admin_only">Solo admin</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Tags (separados por coma)</label>
                <input
                  value={form.tags}
                  onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="certificados, puerto, legal"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Identificador</label>
                <input
                  value={form.identifier}
                  onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Ej: REG-2026-001"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-gray-700">Fecha de emision</label>
                  <input
                    type="date"
                    value={form.issuedAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, issuedAt: event.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-700">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, expiryDate: event.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Version inicial (opcional)</p>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Archivo</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                    onChange={(event) => setCreateFile(event.target.files?.[0] || null)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
                {createFile && (
                  <p className="mt-2 text-xs text-slate-600">
                    {createFile.name} - {(createFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
                {uploadProgress > 0 && (
                  <p className="mt-2 text-xs text-blue-600">Subiendo archivo: {uploadProgress}%</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border px-3 py-2 text-sm text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
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
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Subir nueva version</h2>
            <form className="mt-4 space-y-4" onSubmit={submitVersion}>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Archivo</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                  required
                  onChange={(event) => setVersionFile(event.target.files?.[0] || null)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              {versionFile && (
                <p className="text-xs text-slate-600">
                  {versionFile.name} - {(versionFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              )}
              {uploadProgress > 0 && (
                <p className="text-xs text-blue-600">Subiendo archivo: {uploadProgress}%</p>
              )}
              <div>
                <label className="mb-1 block text-sm text-gray-700">Nota</label>
                <textarea
                  value={versionForm.note}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, note: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="rounded-lg border px-3 py-2 text-sm text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
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
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              {reviewAction === 'submit'
                ? 'Enviar documento'
                : reviewAction === 'approve'
                  ? 'Aprobar documento'
                  : 'Rechazar documento'}
            </h2>
            <form className="mt-4 space-y-4" onSubmit={submitReviewAction}>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Motivo</label>
                <textarea
                  required
                  minLength={3}
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Detalle el motivo para auditoria"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="rounded-lg border px-3 py-2 text-sm text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Procesando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetailModal && selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedDocument.title || selectedDocument.docType}</h2>
                <p className="text-sm text-gray-600">{selectedDocument.docType}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg border px-3 py-2 text-sm text-gray-700"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">Estado operativo</p>
                <div className="mt-1"><StatusBadge status={selectedDocument.status} /></div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">Flujo</p>
                <div className="mt-1"><WorkflowBadge workflowStatus={selectedDocument.workflowStatus} /></div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-gray-500">Confidencialidad</p>
                <p className="mt-1 text-sm text-gray-900">
                  {CONFIDENTIALITY_LABELS[selectedDocument.confidentiality || 'crew_only']}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <h3 className="text-sm font-semibold text-gray-900">Versiones</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {(selectedDocument.versions || []).length === 0 ? (
                    <li className="text-gray-500">Sin versiones</li>
                  ) : (
                    (selectedDocument.versions || []).map((version) => (
                      <li key={version.id} className="rounded border p-2">
                        <p className="font-medium text-gray-900">v{version.versionNo} - {version.fileName}</p>
                        <p className="text-xs text-gray-600">{new Date(version.uploadedAt).toLocaleString()}</p>
                        <div className="mt-1 flex gap-3">
                          <a className="text-xs text-blue-700 hover:underline" href={version.fileUrl} target="_blank" rel="noreferrer">
                            Ver
                          </a>
                          <a
                            className="text-xs text-blue-700 hover:underline"
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

              <div className="rounded-lg border p-3">
                <h3 className="text-sm font-semibold text-gray-900">Auditoria</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {(selectedDocument.auditTrail || []).length === 0 ? (
                    <li className="text-gray-500">Sin registros de auditoria</li>
                  ) : (
                    (selectedDocument.auditTrail || []).map((audit) => (
                      <li key={audit.id} className="rounded border p-2">
                        <p className="font-medium text-gray-900">{audit.action}</p>
                        <p className="text-xs text-gray-700">{AUDIT_ACTION_LABELS[audit.action] || audit.action}</p>
                        <p className="text-xs text-gray-600">{audit.actorName} - {new Date(audit.timestamp).toLocaleString()}</p>
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
