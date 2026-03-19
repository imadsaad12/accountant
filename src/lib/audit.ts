import { prisma } from "@/lib/db";

export async function logAudit(params: {
  session: { userId: string; email: string; name: string; organizationId: string };
  action: "create" | "update" | "delete";
  entity: string;
  entityId?: string;
  description: string;
  method?: "manual" | "ai";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.session.userId,
        userName: params.session.name,
        userEmail: params.session.email,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        description: params.description,
        method: params.method || "manual",
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        organizationId: params.session.organizationId,
      },
    });
  } catch (error) {
    console.error("Audit log error:", error);
  }
}
