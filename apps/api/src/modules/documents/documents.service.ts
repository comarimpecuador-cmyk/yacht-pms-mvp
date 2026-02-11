import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentConfidentiality,
  DocumentStatus,
  DocumentWorkflowStatus,
  Prisma,
} from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  AddDocumentEvidenceDto,
  ApproveDocumentDto,
  CreateDocumentDto,
  CreateDocumentVersionDto,
  ListDocumentsQueryDto,
  RejectDocumentDto,
  SubmitDocumentDto,
  UpdateDocumentDto,
  UpdateDocumentRenewalDto,
} from './dto';

type DocumentWithRelations = Prisma.DocumentGetPayload<{
  include: {
    versions: true;
    evidences: true;
    renewals: true;
  };
}>;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly alertsService: AlertsService,
    private readonly storageService: StorageService,
  ) {}

  private readonly expiringDocTypes = new Set<string>(['CERTIFICATE', 'INSURANCE', 'PORT_CLEARANCE']);

  private readonly documentInclude = {
    versions: {
      orderBy: [{ versionNo: 'desc' as const }, { uploadedAt: 'desc' as const }],
    },
    evidences: {
      orderBy: { uploadedAt: 'desc' as const },
    },
    renewals: {
      orderBy: { requestedAt: 'desc' as const },
    },
  };

  private normalizeRole(role?: string | null) {
    if (!role) return '';
    const normalized = role.trim();
    if (normalized === 'Engineer') return 'Chief Engineer';
    if (normalized === 'Steward') return 'Crew Member';
    return normalized;
  }

  private isAdminRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return normalized === 'Admin' || normalized === 'SystemAdmin';
  }

  private isApprovalRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return normalized === 'Captain' || normalized === 'Admin' || normalized === 'SystemAdmin';
  }

  private assertYachtScope(yachtId: string, yachtIds: string[]) {
    if (!yachtId) {
      throw new BadRequestException('yachtId is required');
    }
    if (!yachtIds.includes(yachtId)) {
      throw new ForbiddenException('Yacht scope violation');
    }
  }

  private normalizeDocType(docType: string) {
    return docType.trim().toUpperCase().replace(/\s+/g, '_');
  }

  private sanitizeTags(tags?: string[]) {
    if (!Array.isArray(tags)) return [];
    const unique = new Set<string>();
    for (const tag of tags) {
      const normalized = String(tag || '').trim();
      if (!normalized) continue;
      unique.add(normalized.slice(0, 40));
    }
    return Array.from(unique);
  }

  private parseOptionalDate(value: string | undefined, field: string): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return parsed;
  }

  private assertExpiryPolicy(docType: string, expiryDate?: Date | null) {
    if (!this.expiringDocTypes.has(docType)) return;
    if (!expiryDate) {
      throw new BadRequestException(`expiryDate is required for document type ${docType}`);
    }
  }

  private computeStatus(expiryDate?: Date | null) {
    if (!expiryDate) {
      return DocumentStatus.Active;
    }

    const now = new Date();
    if (expiryDate.getTime() < now.getTime()) {
      return DocumentStatus.Expired;
    }

    const daysDiff = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 30) {
      return DocumentStatus.ExpiringSoon;
    }

    return DocumentStatus.Active;
  }

  private requireReason(reason: string | undefined, fallback: string): string {
    const value = (reason || '').trim();
    if (value.length >= 3) return value;
    if (fallback.trim().length >= 3) return fallback.trim();
    throw new BadRequestException('reason is required (min 3 chars)');
  }

  private isEditBlocked(workflowStatus: DocumentWorkflowStatus, lockedAt: Date | null) {
    return workflowStatus === 'approved' || workflowStatus === 'archived' || Boolean(lockedAt);
  }

  private assertCanEdit(document: { workflowStatus: DocumentWorkflowStatus; lockedAt: Date | null }, actorRole: string) {
    if (!this.isEditBlocked(document.workflowStatus, document.lockedAt)) return;
    if (this.isAdminRole(actorRole)) return;
    throw new ConflictException('Document is locked and cannot be edited');
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private withCurrentVersion(document: DocumentWithRelations) {
    return {
      ...document,
      currentVersion: document.versions[0] || null,
    };
  }

  private async listYachtUsersByRoles(yachtId: string, roles: string[]) {
    const targetRoles = new Set(roles.map((role) => this.normalizeRole(role)));

    const rows = await this.prisma.userYachtAccess.findMany({
      where: {
        yachtId,
        revokedAt: null,
        user: { isActive: true },
      },
      include: {
        user: {
          select: {
            id: true,
            role: {
              select: { name: true },
            },
          },
        },
      },
    });

    return rows
      .filter((row) => {
        const effectiveRole = this.normalizeRole(row.roleNameOverride || row.user.role?.name || '');
        return targetRoles.has(effectiveRole);
      })
      .map((row) => row.user.id);
  }

  private async resolveRecipients(input: {
    yachtId: string;
    assignedToUserId?: string | null;
    createdByUserId?: string | null;
    extraUserIds?: string[];
    includeApprovers?: boolean;
  }) {
    const approvers = input.includeApprovers
      ? await this.listYachtUsersByRoles(input.yachtId, ['Captain', 'Admin', 'SystemAdmin'])
      : [];

    return Array.from(
      new Set(
        [
          ...(input.extraUserIds || []),
          ...(input.assignedToUserId ? [input.assignedToUserId] : []),
          ...(input.createdByUserId ? [input.createdByUserId] : []),
          ...approvers,
        ].filter(Boolean),
      ),
    );
  }

  private async createDocumentVersion(
    tx: Prisma.TransactionClient,
    input: {
      documentId: string;
      uploadedByUserId: string;
      fileKey?: string | null;
      fileUrl?: string | null;
      fileName: string;
      mimeType: string;
      sizeBytes?: number | null;
      checksumSha256?: string | null;
      storageProvider?: string | null;
      note?: string | null;
    },
  ) {
    const resolvedFileUrl = input.fileKey
      ? await this.storageService.getSignedUrl({ fileKey: input.fileKey })
      : input.fileUrl;
    if (!resolvedFileUrl) {
      throw new BadRequestException('fileKey or fileUrl is required');
    }

    const currentMax = await tx.documentVersion.aggregate({
      where: { documentId: input.documentId },
      _max: { versionNo: true },
    });
    const nextVersion = (currentMax._max.versionNo || 0) + 1;

    const version = await tx.documentVersion.create({
      data: {
        documentId: input.documentId,
        versionNo: nextVersion,
        fileKey: input.fileKey ?? null,
        storageProvider: input.storageProvider || (input.fileKey ? 'local' : null),
        fileUrl: resolvedFileUrl,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes ?? null,
        checksumSha256: input.checksumSha256 ?? null,
        uploadedByUserId: input.uploadedByUserId,
        note: input.note ?? null,
      },
    });

    await tx.document.update({
      where: { id: input.documentId },
      data: {
        currentVersionId: version.id,
      },
    });

    return version;
  }

  private async getDocumentWithScope(id: string, yachtIds: string[]) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: this.documentInclude,
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    this.assertYachtScope(document.yachtId, yachtIds);
    return document;
  }

  private async createAudit(
    actorId: string,
    action: string,
    entityId: string,
    beforeJson: Prisma.InputJsonValue | null,
    afterJson: Prisma.InputJsonValue | null,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        module: 'documents',
        entityType: 'Document',
        entityId,
        action,
        actorId,
        beforeJson: beforeJson ?? Prisma.DbNull,
        afterJson: afterJson ?? Prisma.DbNull,
        source: 'api',
      },
    });
  }

  private async notifyUsers(
    userIds: string[],
    yachtId: string,
    type: string,
    dedupeKeyBase: string,
    payload: Prisma.JsonObject,
  ) {
    const uniqueUsers = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUsers.length === 0) return;

    await Promise.all(
      uniqueUsers.map((userId) =>
        this.notificationsService.createInApp({
          userId,
          yachtId,
          type,
          dedupeKey: `${dedupeKeyBase}-${userId}`,
          payload,
        }),
      ),
    );
  }

  private async resolveDocumentAlert(documentId: string) {
    await this.alertsService.resolveByDedupeKey(`document-${documentId}-expiry`);
  }

  private async upsertDocumentExpiryAlert(document: {
    id: string;
    yachtId: string;
    status: DocumentStatus;
    workflowStatus: DocumentWorkflowStatus;
    expiryDate: Date | null;
    assignedToUserId: string | null;
    createdBy: string;
    title?: string | null;
  }) {
    const finalStatuses = new Set<DocumentStatus>([DocumentStatus.Archived, DocumentStatus.Renewed]);

    if (
      finalStatuses.has(document.status) ||
      document.workflowStatus === 'archived' ||
      !document.expiryDate
    ) {
      await this.resolveDocumentAlert(document.id);
      return;
    }

    const now = Date.now();
    const daysLeft = Math.ceil((document.expiryDate.getTime() - now) / (1000 * 60 * 60 * 24));
    if (daysLeft > 30) {
      await this.resolveDocumentAlert(document.id);
      return;
    }

    const severity = daysLeft <= 7 || daysLeft < 0 ? 'critical' : 'warn';
    await this.alertsService.upsertAlert({
      yachtId: document.yachtId,
      module: 'documents',
      alertType: 'DOC_EXPIRING',
      severity,
      dueAt: document.expiryDate,
      dedupeKey: `document-${document.id}-expiry`,
      entityId: document.id,
      assignedTo: document.assignedToUserId || document.createdBy,
    });

    await this.notifyUsers(
      [document.assignedToUserId || '', document.createdBy],
      document.yachtId,
      daysLeft < 0 ? 'documents.expired' : 'documents.expiring',
      `document-${document.id}-expiring-${Math.max(daysLeft, 0)}`,
      {
        documentId: document.id,
        title: document.title || 'Documento',
        daysLeft,
      },
    );
  }

  private async buildAuditTrail(entityId: string) {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        module: 'documents',
        entityType: 'Document',
        entityId,
      },
      orderBy: { timestamp: 'desc' },
      take: 120,
    });

    const actorIds = Array.from(new Set(rows.map((row) => row.actorId).filter(Boolean)));
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((user) => [user.id, user.fullName || user.email]));

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorName: userMap.get(row.actorId) || row.actorId,
      timestamp: row.timestamp,
      beforeJson: row.beforeJson,
      afterJson: row.afterJson,
      source: row.source,
    }));
  }

  status() {
    return { module: 'documents', ready: true };
  }

  async listDocuments(query: ListDocumentsQueryDto, yachtIds: string[]) {
    this.assertYachtScope(query.yachtId, yachtIds);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;

    const where: Prisma.DocumentWhereInput = {
      yachtId: query.yachtId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.workflowStatus) {
      where.workflowStatus = query.workflowStatus;
    }

    if (query.docType) {
      where.docType = { contains: query.docType.trim(), mode: 'insensitive' };
    }

    if (query.search) {
      const term = query.search.trim();
      if (term.length > 0) {
        where.OR = [
          { title: { contains: term, mode: 'insensitive' } },
          { docType: { contains: term, mode: 'insensitive' } },
          { docSubType: { contains: term, mode: 'insensitive' } },
          { identifier: { contains: term, mode: 'insensitive' } },
          { notes: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    if (query.expiringSoon === 'true' || query.expiringSoon === '1') {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      where.expiryDate = { gte: now, lte: end };
      where.status = { not: DocumentStatus.Archived };
      where.workflowStatus = { not: 'archived' };
    }

    if (query.expiringInDays) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + query.expiringInDays);
      where.expiryDate = { gte: now, lte: end };
      where.status = { not: DocumentStatus.Archived };
      where.workflowStatus = { not: 'archived' };
    }

    const [total, docs] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include: {
          versions: {
            orderBy: [{ versionNo: 'desc' }, { uploadedAt: 'desc' }],
            take: 1,
          },
          evidences: {
            orderBy: { uploadedAt: 'desc' },
            take: 3,
          },
          renewals: {
            orderBy: { requestedAt: 'desc' },
            take: 3,
          },
        },
        orderBy: [{ expiryDate: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: docs.map((doc) => ({
        ...doc,
        currentVersion: doc.versions[0] || null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async createDocument(actorId: string, dto: CreateDocumentDto, yachtIds: string[]) {
    this.assertYachtScope(dto.yachtId, yachtIds);

    const title = dto.title?.trim();
    if (!title || title.length < 3) {
      throw new BadRequestException('title is required');
    }

    const docType = this.normalizeDocType(dto.docType || 'OTHER');
    const issuedAt = this.parseOptionalDate(dto.issuedAt, 'issuedAt');
    const expiryDate = this.parseOptionalDate(dto.expiryDate, 'expiryDate');
    this.assertExpiryPolicy(docType, expiryDate);

    const created = await this.prisma.$transaction(async (tx) => {
      const createdDoc = await tx.document.create({
        data: {
          yachtId: dto.yachtId,
          title,
          docType,
          docSubType: dto.docSubType?.trim() || null,
          confidentiality: dto.confidentiality || DocumentConfidentiality.crew_only,
          tags: this.sanitizeTags(dto.tags),
          identifier: dto.identifier?.trim() || null,
          issuedAt,
          expiryDate,
          notes: dto.notes?.trim() || null,
          status: this.computeStatus(expiryDate),
          workflowStatus: 'draft',
          workflowReason: 'Documento creado',
          assignedToUserId: dto.assignedToUserId?.trim() || null,
          createdBy: actorId,
        },
      });

      if (dto.initialVersion) {
        await this.createDocumentVersion(tx, {
          documentId: createdDoc.id,
          uploadedByUserId: actorId,
          fileKey: dto.initialVersion.fileKey?.trim() || null,
          fileUrl: dto.initialVersion.fileUrl?.trim() || null,
          fileName: dto.initialVersion.fileName.trim(),
          mimeType: dto.initialVersion.mimeType.trim(),
          sizeBytes: dto.initialVersion.sizeBytes ?? null,
          checksumSha256: dto.initialVersion.checksumSha256?.trim() || null,
          storageProvider: dto.initialVersion.fileKey ? 'local' : null,
          note: dto.initialVersion.note?.trim() || null,
        });
      }

      return tx.document.findUniqueOrThrow({
        where: { id: createdDoc.id },
        include: this.documentInclude,
      });
    });

    await this.createAudit(actorId, 'create_document', created.id, null, this.toJson(created));
    await this.upsertDocumentExpiryAlert(created);

    const recipients = await this.resolveRecipients({
      yachtId: created.yachtId,
      assignedToUserId: created.assignedToUserId,
      createdByUserId: created.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(recipients, created.yachtId, 'documents.created', `document-${created.id}-created`, {
      documentId: created.id,
      title: created.title || 'Documento',
      docType: created.docType,
      status: created.workflowStatus,
    });

    return {
      ...this.withCurrentVersion(created),
      auditTrail: await this.buildAuditTrail(created.id),
    };
  }

  async getDocument(id: string, yachtIds: string[]) {
    const document = await this.getDocumentWithScope(id, yachtIds);
    return {
      ...this.withCurrentVersion(document),
      auditTrail: await this.buildAuditTrail(document.id),
    };
  }

  async updateDocument(
    id: string,
    actorId: string,
    actorRole: string,
    dto: UpdateDocumentDto,
    yachtIds: string[],
  ) {
    const current = await this.getDocumentWithScope(id, yachtIds);
    this.assertCanEdit(current, actorRole);

    const patch: Prisma.DocumentUncheckedUpdateInput = {};

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (title.length < 3) throw new BadRequestException('title must contain at least 3 chars');
      patch.title = title;
    }

    let normalizedDocType = current.docType;
    if (dto.docType !== undefined) {
      normalizedDocType = this.normalizeDocType(dto.docType);
      patch.docType = normalizedDocType;
    }

    if (dto.docSubType !== undefined) patch.docSubType = dto.docSubType.trim() || null;
    if (dto.identifier !== undefined) patch.identifier = dto.identifier.trim() || null;
    if (dto.notes !== undefined) patch.notes = dto.notes.trim() || null;
    if (dto.tags !== undefined) patch.tags = this.sanitizeTags(dto.tags);
    if (dto.confidentiality !== undefined) patch.confidentiality = dto.confidentiality;
    if (dto.assignedToUserId !== undefined) patch.assignedToUserId = dto.assignedToUserId.trim() || null;

    if (dto.issuedAt !== undefined) {
      patch.issuedAt = this.parseOptionalDate(dto.issuedAt, 'issuedAt');
    }

    let nextExpiryDate = current.expiryDate;
    if (dto.expiryDate !== undefined) {
      nextExpiryDate = this.parseOptionalDate(dto.expiryDate, 'expiryDate');
      patch.expiryDate = nextExpiryDate;
    }

    this.assertExpiryPolicy(normalizedDocType, nextExpiryDate);

    if (dto.status !== undefined) {
      patch.status = dto.status;
    } else if (dto.expiryDate !== undefined || dto.docType !== undefined) {
      patch.status = this.computeStatus(nextExpiryDate);
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No document fields to update');
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: patch,
      include: this.documentInclude,
    });

    await this.createAudit(actorId, 'update_document', updated.id, this.toJson(current), this.toJson(updated));
    await this.upsertDocumentExpiryAlert(updated);

    const recipients = await this.resolveRecipients({
      yachtId: updated.yachtId,
      assignedToUserId: updated.assignedToUserId,
      createdByUserId: updated.createdBy,
    });

    await this.notifyUsers(recipients, updated.yachtId, 'documents.updated', `document-${updated.id}-updated`, {
      documentId: updated.id,
      title: updated.title || 'Documento',
      docType: updated.docType,
      status: updated.workflowStatus,
    });

    return {
      ...this.withCurrentVersion(updated),
      auditTrail: await this.buildAuditTrail(updated.id),
    };
  }

  async addVersion(
    id: string,
    dto: CreateDocumentVersionDto,
    actorId: string,
    actorRole: string,
    yachtIds: string[],
  ) {
    const current = await this.getDocumentWithScope(id, yachtIds);
    if (current.workflowStatus === 'archived' || current.status === DocumentStatus.Archived) {
      throw new ConflictException('Archived documents cannot receive new versions');
    }

    this.assertCanEdit(current, actorRole);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.createDocumentVersion(tx, {
        documentId: current.id,
        uploadedByUserId: actorId,
        fileKey: dto.fileKey?.trim() || null,
        fileUrl: dto.fileUrl?.trim() || null,
        fileName: dto.fileName.trim(),
        mimeType: dto.mimeType.trim(),
        sizeBytes: dto.sizeBytes ?? null,
        checksumSha256: dto.checksumSha256?.trim() || null,
        storageProvider: dto.fileKey ? 'local' : null,
        note: dto.note?.trim() || null,
      });

      return tx.document.update({
        where: { id: current.id },
        data: {
          workflowStatus: 'draft',
          workflowReason: dto.note?.trim() || 'Nueva version cargada',
          lockedAt: null,
          approvedByUserId: null,
          approvedAt: null,
          status: this.computeStatus(current.expiryDate),
        },
        include: this.documentInclude,
      });
    });

    await this.createAudit(actorId, 'upload_version', updated.id, this.toJson(current), this.toJson(updated));
    await this.upsertDocumentExpiryAlert(updated);

    const recipients = await this.resolveRecipients({
      yachtId: updated.yachtId,
      assignedToUserId: updated.assignedToUserId,
      createdByUserId: updated.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(recipients, updated.yachtId, 'documents.version_uploaded', `document-${updated.id}-version`, {
      documentId: updated.id,
      title: updated.title || 'Documento',
      status: updated.workflowStatus,
    });

    return {
      ...this.withCurrentVersion(updated),
      auditTrail: await this.buildAuditTrail(updated.id),
    };
  }

  async submitDocument(
    id: string,
    actorId: string,
    actorRole: string,
    dto: SubmitDocumentDto,
    yachtIds: string[],
  ) {
    const current = await this.getDocumentWithScope(id, yachtIds);

    if (current.workflowStatus === 'archived') {
      throw new ConflictException('Archived document cannot be submitted');
    }
    if (current.workflowStatus === 'approved' && !this.isAdminRole(actorRole)) {
      throw new ConflictException('Approved document cannot be re-submitted');
    }
    if (current.versions.length === 0) {
      throw new ConflictException('Document requires at least one version before submit');
    }

    const reason = this.requireReason(dto.reason, 'Enviado a aprobacion');

    const submitted = await this.prisma.document.update({
      where: { id },
      data: {
        workflowStatus: 'submitted',
        workflowReason: reason,
        lockedAt: null,
      },
      include: this.documentInclude,
    });

    await this.createAudit(actorId, 'submit_document', submitted.id, this.toJson(current), this.toJson(submitted));

    const recipients = await this.resolveRecipients({
      yachtId: submitted.yachtId,
      assignedToUserId: submitted.assignedToUserId,
      createdByUserId: submitted.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(recipients, submitted.yachtId, 'documents.submitted', `document-${submitted.id}-submitted`, {
      documentId: submitted.id,
      title: submitted.title || 'Documento',
      reason,
      status: submitted.workflowStatus,
    });

    return {
      ...this.withCurrentVersion(submitted),
      auditTrail: await this.buildAuditTrail(submitted.id),
    };
  }

  async approveDocument(
    id: string,
    actorId: string,
    actorRole: string,
    dto: ApproveDocumentDto,
    yachtIds: string[],
  ) {
    if (!this.isApprovalRole(actorRole)) {
      throw new ForbiddenException('Only Captain/Admin/SystemAdmin can approve documents');
    }

    const current = await this.getDocumentWithScope(id, yachtIds);
    if (current.workflowStatus !== 'submitted') {
      throw new ConflictException('Only submitted documents can be approved');
    }

    const reason = this.requireReason(dto.reason, 'Documento aprobado');
    const approvedAt = new Date();

    const approved = await this.prisma.document.update({
      where: { id },
      data: {
        workflowStatus: 'approved',
        workflowReason: reason,
        approvedByUserId: actorId,
        approvedAt,
        lockedAt: approvedAt,
        status: this.computeStatus(current.expiryDate),
      },
      include: this.documentInclude,
    });

    await this.createAudit(actorId, 'approve_document', approved.id, this.toJson(current), this.toJson(approved));
    await this.upsertDocumentExpiryAlert(approved);

    const recipients = await this.resolveRecipients({
      yachtId: approved.yachtId,
      assignedToUserId: approved.assignedToUserId,
      createdByUserId: approved.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(recipients, approved.yachtId, 'documents.approved', `document-${approved.id}-approved`, {
      documentId: approved.id,
      title: approved.title || 'Documento',
      reason,
      status: approved.workflowStatus,
    });

    return {
      ...this.withCurrentVersion(approved),
      auditTrail: await this.buildAuditTrail(approved.id),
    };
  }

  async rejectDocument(
    id: string,
    actorId: string,
    actorRole: string,
    dto: RejectDocumentDto,
    yachtIds: string[],
  ) {
    if (!this.isApprovalRole(actorRole)) {
      throw new ForbiddenException('Only Captain/Admin/SystemAdmin can reject documents');
    }

    const current = await this.getDocumentWithScope(id, yachtIds);
    if (current.workflowStatus !== 'submitted') {
      throw new ConflictException('Only submitted documents can be rejected');
    }

    const reason = this.requireReason(dto.reason, 'Documento rechazado');

    const rejected = await this.prisma.document.update({
      where: { id },
      data: {
        workflowStatus: 'rejected',
        workflowReason: reason,
        lockedAt: null,
        approvedAt: null,
        approvedByUserId: null,
      },
      include: this.documentInclude,
    });

    await this.createAudit(actorId, 'reject_document', rejected.id, this.toJson(current), this.toJson(rejected));

    const recipients = await this.resolveRecipients({
      yachtId: rejected.yachtId,
      assignedToUserId: rejected.assignedToUserId,
      createdByUserId: rejected.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(recipients, rejected.yachtId, 'documents.rejected', `document-${rejected.id}-rejected`, {
      documentId: rejected.id,
      title: rejected.title || 'Documento',
      reason,
      status: rejected.workflowStatus,
    });

    return {
      ...this.withCurrentVersion(rejected),
      auditTrail: await this.buildAuditTrail(rejected.id),
    };
  }

  async archiveDocument(id: string, actorId: string, actorRole: string, yachtIds: string[]) {
    const current = await this.getDocumentWithScope(id, yachtIds);
    if (current.workflowStatus === 'archived' || current.status === DocumentStatus.Archived) {
      return {
        ...this.withCurrentVersion(current),
        auditTrail: await this.buildAuditTrail(current.id),
      };
    }

    if (!this.isApprovalRole(actorRole) && !this.isAdminRole(actorRole)) {
      throw new ForbiddenException('Only Captain/Admin/SystemAdmin can archive documents');
    }

    const now = new Date();
    const archived = await this.prisma.document.update({
      where: { id },
      data: {
        workflowStatus: 'archived',
        workflowReason: 'Archivado manualmente',
        status: DocumentStatus.Archived,
        lockedAt: now,
      },
      include: this.documentInclude,
    });

    await this.createAudit(actorId, 'archive_document', archived.id, this.toJson(current), this.toJson(archived));
    await this.resolveDocumentAlert(archived.id);

    const recipients = await this.resolveRecipients({
      yachtId: archived.yachtId,
      assignedToUserId: archived.assignedToUserId,
      createdByUserId: archived.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(recipients, archived.yachtId, 'documents.archived', `document-${archived.id}-archived`, {
      documentId: archived.id,
      title: archived.title || 'Documento',
      status: archived.workflowStatus,
    });

    return {
      ...this.withCurrentVersion(archived),
      auditTrail: await this.buildAuditTrail(archived.id),
    };
  }

  async deleteDocument(
    id: string,
    actorId: string,
    actorRole: string,
    yachtIds: string[],
  ) {
    if (!this.isAdminRole(actorRole)) {
      throw new ForbiddenException('Only Admin/SystemAdmin can delete documents');
    }

    const current = await this.getDocumentWithScope(id, yachtIds);
    if (current.workflowStatus === 'approved' || current.workflowStatus === 'submitted') {
      throw new ConflictException('Cannot delete submitted/approved documents');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          module: 'documents',
          entityType: 'Document',
          entityId: current.id,
          action: 'delete_document',
          actorId,
          beforeJson: this.toJson(current),
          afterJson: Prisma.DbNull,
          source: 'api',
        },
      });

      await tx.documentEvidence.deleteMany({ where: { documentId: id } });
      await tx.documentRenewal.deleteMany({ where: { documentId: id } });
      await tx.documentVersion.deleteMany({ where: { documentId: id } });
      await tx.document.delete({ where: { id } });
    });

    await this.resolveDocumentAlert(id);

    const recipients = await this.resolveRecipients({
      yachtId: current.yachtId,
      assignedToUserId: current.assignedToUserId,
      createdByUserId: current.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(recipients, current.yachtId, 'documents.deleted', `document-${id}-deleted`, {
      documentId: id,
      title: current.title || 'Documento',
    });

    return { success: true };
  }

  async addEvidence(
    documentId: string,
    dto: AddDocumentEvidenceDto,
    uploadedBy: string,
    actorRole: string,
    yachtIds: string[],
  ) {
    const document = await this.getDocumentWithScope(documentId, yachtIds);
    this.assertCanEdit(document, actorRole);

    if (document.status === DocumentStatus.Archived || document.workflowStatus === 'archived') {
      throw new BadRequestException('Archived documents cannot receive evidences');
    }

    const inProgressRenewal = await this.prisma.documentRenewal.findFirst({
      where: {
        documentId,
        status: 'IN_PROGRESS',
      },
      orderBy: { requestedAt: 'desc' },
    });

    const evidence = await this.prisma.documentEvidence.create({
      data: {
        documentId,
        renewalId: inProgressRenewal?.id ?? null,
        fileUrl: dto.fileUrl.trim(),
        comment: dto.comment?.trim(),
        uploadedBy,
      },
    });

    await this.createAudit(
      uploadedBy,
      'add_evidence',
      document.id,
      null,
      this.toJson({ evidenceId: evidence.id, fileUrl: evidence.fileUrl }),
    );

    const recipients = await this.resolveRecipients({
      yachtId: document.yachtId,
      assignedToUserId: document.assignedToUserId,
      createdByUserId: document.createdBy,
      includeApprovers: true,
      extraUserIds: [uploadedBy],
    });

    await this.notifyUsers(
      recipients.filter((userId) => userId !== uploadedBy),
      document.yachtId,
      'documents.evidence_added',
      `document-${document.id}-evidence-${evidence.id}`,
      {
        documentId: document.id,
        title: document.title || 'Documento',
        evidenceId: evidence.id,
      },
    );

    return evidence;
  }

  async startRenewal(
    documentId: string,
    actorId: string,
    actorRole: string,
    yachtIds: string[],
  ) {
    const document = await this.getDocumentWithScope(documentId, yachtIds);
    this.assertCanEdit(document, actorRole);

    const ongoing = await this.prisma.documentRenewal.findFirst({
      where: { documentId, status: 'IN_PROGRESS' },
    });
    if (ongoing) {
      throw new BadRequestException('Document already has an IN_PROGRESS renewal');
    }

    const renewal = await this.prisma.documentRenewal.create({
      data: {
        documentId,
        status: 'IN_PROGRESS',
      },
    });

    const updatedDocument = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.RenewalInProgress,
        workflowReason: 'Renovacion iniciada',
      },
      include: this.documentInclude,
    });

    await this.createAudit(
      actorId,
      'start_renewal',
      updatedDocument.id,
      this.toJson(document),
      this.toJson({ renewalId: renewal.id, status: updatedDocument.status }),
    );

    const recipients = await this.resolveRecipients({
      yachtId: updatedDocument.yachtId,
      assignedToUserId: updatedDocument.assignedToUserId,
      createdByUserId: updatedDocument.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(
      recipients,
      updatedDocument.yachtId,
      'documents.renewal_started',
      `document-${updatedDocument.id}-renewal-started-${renewal.id}`,
      {
        documentId: updatedDocument.id,
        title: updatedDocument.title || 'Documento',
        renewalId: renewal.id,
      },
    );

    return {
      renewal,
      document: {
        ...this.withCurrentVersion(updatedDocument),
        auditTrail: await this.buildAuditTrail(updatedDocument.id),
      },
    };
  }

  async updateRenewal(
    documentId: string,
    renewalId: string,
    actorId: string,
    actorRole: string,
    dto: UpdateDocumentRenewalDto,
    yachtIds: string[],
  ) {
    const document = await this.getDocumentWithScope(documentId, yachtIds);
    this.assertCanEdit(document, actorRole);

    const renewal = await this.prisma.documentRenewal.findFirst({
      where: { id: renewalId, documentId },
    });
    if (!renewal) {
      throw new NotFoundException('Document renewal not found');
    }

    const normalizedStatus = dto.status.trim().toUpperCase();
    if (!['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(normalizedStatus)) {
      throw new BadRequestException('Invalid renewal status');
    }

    const completedAt = dto.completedAt ? this.parseOptionalDate(dto.completedAt, 'completedAt') : null;

    const updatedRenewal = await this.prisma.documentRenewal.update({
      where: { id: renewalId },
      data: {
        status: normalizedStatus,
        completedAt: normalizedStatus === 'COMPLETED' ? completedAt || new Date() : null,
      },
    });

    let nextStatus: DocumentStatus;
    if (normalizedStatus === 'IN_PROGRESS') {
      nextStatus = DocumentStatus.RenewalInProgress;
    } else if (normalizedStatus === 'COMPLETED') {
      nextStatus = DocumentStatus.Renewed;
    } else {
      nextStatus = this.computeStatus(document.expiryDate);
    }

    const patch: Prisma.DocumentUpdateInput = {
      status: nextStatus,
      workflowReason: `Renovacion ${normalizedStatus.toLowerCase()}`,
    };

    if (dto.newExpiryDate !== undefined) {
      const nextExpiry = this.parseOptionalDate(dto.newExpiryDate, 'newExpiryDate');
      patch.expiryDate = nextExpiry;
      if (normalizedStatus !== 'IN_PROGRESS') {
        patch.status = this.computeStatus(nextExpiry);
      }
    }

    const updatedDocument = await this.prisma.document.update({
      where: { id: documentId },
      data: patch,
      include: this.documentInclude,
    });

    await this.createAudit(
      actorId,
      'update_renewal',
      updatedDocument.id,
      this.toJson(document),
      this.toJson({
        renewalId: updatedRenewal.id,
        renewalStatus: updatedRenewal.status,
        status: updatedDocument.status,
      }),
    );

    await this.upsertDocumentExpiryAlert(updatedDocument);

    const recipients = await this.resolveRecipients({
      yachtId: updatedDocument.yachtId,
      assignedToUserId: updatedDocument.assignedToUserId,
      createdByUserId: updatedDocument.createdBy,
      includeApprovers: true,
    });

    await this.notifyUsers(
      recipients,
      updatedDocument.yachtId,
      normalizedStatus === 'COMPLETED' ? 'documents.renewal_completed' : 'documents.renewal_updated',
      `document-${updatedDocument.id}-renewal-${updatedRenewal.id}-${normalizedStatus.toLowerCase()}`,
      {
        documentId: updatedDocument.id,
        title: updatedDocument.title || 'Documento',
        renewalId: updatedRenewal.id,
        status: updatedRenewal.status,
      },
    );

    return {
      renewal: updatedRenewal,
      document: {
        ...this.withCurrentVersion(updatedDocument),
        auditTrail: await this.buildAuditTrail(updatedDocument.id),
      },
    };
  }

  async getSummary(yachtId: string, yachtIds: string[]) {
    this.assertYachtScope(yachtId, yachtIds);
    const now = new Date();
    const window30 = new Date(now);
    window30.setDate(window30.getDate() + 30);
    const window7 = new Date(now);
    window7.setDate(window7.getDate() + 7);

    const [
      total,
      active,
      expiringSoon,
      expired,
      renewalInProgress,
      renewed,
      archived,
      expiringIn30,
      expiringIn7,
      pendingApproval,
      drafts,
    ] = await Promise.all([
      this.prisma.document.count({ where: { yachtId } }),
      this.prisma.document.count({ where: { yachtId, status: DocumentStatus.Active } }),
      this.prisma.document.count({ where: { yachtId, status: DocumentStatus.ExpiringSoon } }),
      this.prisma.document.count({ where: { yachtId, status: DocumentStatus.Expired } }),
      this.prisma.document.count({ where: { yachtId, status: DocumentStatus.RenewalInProgress } }),
      this.prisma.document.count({ where: { yachtId, status: DocumentStatus.Renewed } }),
      this.prisma.document.count({ where: { yachtId, status: DocumentStatus.Archived } }),
      this.prisma.document.count({
        where: {
          yachtId,
          expiryDate: { gte: now, lte: window30 },
          status: { not: DocumentStatus.Archived },
          workflowStatus: { not: 'archived' },
        },
      }),
      this.prisma.document.count({
        where: {
          yachtId,
          expiryDate: { gte: now, lte: window7 },
          status: { not: DocumentStatus.Archived },
          workflowStatus: { not: 'archived' },
        },
      }),
      this.prisma.document.count({ where: { yachtId, workflowStatus: 'submitted' } }),
      this.prisma.document.count({ where: { yachtId, workflowStatus: 'draft' } }),
    ]);

    return {
      total,
      active,
      expiringSoon,
      expired,
      renewalInProgress,
      renewed,
      archived,
      expiringIn30,
      expiringIn7,
      pendingApproval,
      drafts,
    };
  }

  async getExpiring(yachtId: string, days: number, yachtIds: string[]) {
    this.assertYachtScope(yachtId, yachtIds);

    const now = new Date();
    const windowDays = Number.isFinite(days) ? Math.min(Math.max(Math.floor(days), 1), 365) : 30;
    const end = new Date(now);
    end.setDate(end.getDate() + windowDays);

    return this.prisma.document.findMany({
      where: {
        yachtId,
        expiryDate: {
          gte: now,
          lte: end,
        },
        status: {
          not: DocumentStatus.Archived,
        },
        workflowStatus: {
          not: 'archived',
        },
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        versions: {
          orderBy: [{ versionNo: 'desc' }, { uploadedAt: 'desc' }],
          take: 1,
        },
      },
    });
  }
}
