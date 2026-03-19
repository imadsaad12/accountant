import { NextRequest, NextResponse } from "next/server";
import { getSessionWithPermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "ai")) {
    return NextResponse.json({ error: "No permission to execute AI actions" }, { status: 403 });
  }

  const orgId = session.organizationId;
  const { action } = await req.json();
  if (!action || !action.type) {
    return NextResponse.json({ error: "No action provided" }, { status: 400 });
  }

  try {
    switch (action.type) {
      case "add_client": {
        const client = await prisma.client.create({
          data: {
            name: action.name,
            email: action.email || null,
            phone: action.phone || null,
            address: action.address || null,
            city: action.city || null,
            country: action.country || null,
            taxId: action.taxId || null,
            organizationId: orgId,
          },
        });
        await logAudit({ session, action: "create", entity: "client", entityId: client.id, description: `Created client "${client.name}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Client "${client.name}" created successfully`, data: client });
      }

      case "edit_client": {
        const { id, ...updateData } = action.data;
        const existing = await prisma.client.findFirst({ where: { id, organizationId: orgId } });
        if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });
        const client = await prisma.client.update({ where: { id }, data: updateData });
        await logAudit({ session, action: "update", entity: "client", entityId: client.id, description: `Updated client "${client.name}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Client "${client.name}" updated successfully`, data: client });
      }

      case "delete_client": {
        const existing = await prisma.client.findFirst({ where: { id: action.id, organizationId: orgId } });
        if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });
        const client = await prisma.client.delete({ where: { id: action.id } });
        await logAudit({ session, action: "delete", entity: "client", entityId: action.id, description: `Deleted client "${client.name}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Client "${client.name}" deleted successfully` });
      }

      case "add_product": {
        const product = await prisma.product.create({
          data: {
            name: action.name,
            sku: action.sku || `PROD-${Date.now()}`,
            description: action.description || null,
            price: action.price || 0,
            cost: action.cost || 0,
            quantity: action.quantity || 0,
            minStock: action.minStock || 0,
            unit: action.unit || "piece",
            categoryId: action.categoryId || null,
            organizationId: orgId,
          },
        });
        await logAudit({ session, action: "create", entity: "product", entityId: product.id, description: `Created product "${product.name}" (SKU: ${product.sku})`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Product "${product.name}" created successfully`, data: product });
      }

      case "edit_product": {
        const { id: prodId, ...prodData } = action.data;
        const existingProd = await prisma.product.findFirst({ where: { id: prodId, organizationId: orgId } });
        if (!existingProd) return NextResponse.json({ error: "Product not found" }, { status: 404 });
        const product = await prisma.product.update({ where: { id: prodId }, data: prodData });
        await logAudit({ session, action: "update", entity: "product", entityId: product.id, description: `Updated product "${product.name}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Product "${product.name}" updated successfully`, data: product });
      }

      case "delete_product": {
        const existingProd = await prisma.product.findFirst({ where: { id: action.id, organizationId: orgId } });
        if (!existingProd) return NextResponse.json({ error: "Product not found" }, { status: 404 });
        const product = await prisma.product.delete({ where: { id: action.id } });
        await logAudit({ session, action: "delete", entity: "product", entityId: action.id, description: `Deleted product "${product.name}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Product "${product.name}" deleted successfully` });
      }

      case "add_employee": {
        const employee = await prisma.employee.create({
          data: {
            firstName: action.firstName,
            lastName: action.lastName,
            email: action.email || null,
            phone: action.phone || null,
            position: action.position || null,
            department: action.department || null,
            salary: action.salary || 0,
            hireDate: action.hireDate ? new Date(action.hireDate) : new Date(),
            status: action.status || "active",
            organizationId: orgId,
          },
        });
        await logAudit({ session, action: "create", entity: "employee", entityId: employee.id, description: `Created employee "${employee.firstName} ${employee.lastName}" (${employee.position})`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Employee "${employee.firstName} ${employee.lastName}" created successfully`, data: employee });
      }

      case "edit_employee": {
        const { id: empId, ...empData } = action.data;
        const existingEmp = await prisma.employee.findFirst({ where: { id: empId, organizationId: orgId } });
        if (!existingEmp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
        if (empData.hireDate) empData.hireDate = new Date(empData.hireDate);
        const employee = await prisma.employee.update({ where: { id: empId }, data: empData });
        await logAudit({ session, action: "update", entity: "employee", entityId: employee.id, description: `Updated employee "${employee.firstName} ${employee.lastName}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Employee "${employee.firstName} ${employee.lastName}" updated successfully`, data: employee });
      }

      case "delete_employee": {
        const existingEmp = await prisma.employee.findFirst({ where: { id: action.id, organizationId: orgId } });
        if (!existingEmp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
        const employee = await prisma.employee.delete({ where: { id: action.id } });
        await logAudit({ session, action: "delete", entity: "employee", entityId: action.id, description: `Deleted employee "${employee.firstName} ${employee.lastName}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Employee "${employee.firstName} ${employee.lastName}" deleted successfully` });
      }

      case "add_invoice": {
        const count = await prisma.invoice.count({ where: { organizationId: orgId } });
        const number = `INV-${String(count + 1).padStart(5, "0")}`;

        const items = action.items || [];
        const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0);
        const taxRate = action.taxRate || 19;
        const tax = subtotal * (taxRate / 100);
        const total = subtotal + tax;

        for (const item of items) {
          if (item.productId) {
            await prisma.product.update({ where: { id: item.productId }, data: { quantity: { decrement: item.quantity } } });
          }
        }

        const invoice = await prisma.invoice.create({
          data: {
            number,
            clientId: action.clientId,
            date: action.date ? new Date(action.date) : new Date(),
            dueDate: action.dueDate ? new Date(action.dueDate) : null,
            status: action.status || "draft",
            subtotal, tax, taxRate, total,
            language: action.language || "fr",
            notes: action.notes || null,
            organizationId: orgId,
            items: {
              create: items.map((item: { description: string; quantity: number; unitPrice: number; productId?: string }) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.quantity * item.unitPrice,
                productId: item.productId || null,
              })),
            },
          },
          include: { client: true, items: true },
        });
        await logAudit({ session, action: "create", entity: "invoice", entityId: invoice.id, description: `Created invoice ${invoice.number} for ${invoice.client.name} - $${total.toFixed(2)}`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Invoice ${invoice.number} created for ${invoice.client.name} - Total: $${total.toFixed(2)}`, data: invoice });
      }

      case "update_invoice_status": {
        const existingInv = await prisma.invoice.findFirst({ where: { id: action.id, organizationId: orgId } });
        if (!existingInv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        const invoice = await prisma.invoice.update({ where: { id: action.id }, data: { status: action.status }, include: { client: true } });
        await logAudit({ session, action: "update", entity: "invoice", entityId: invoice.id, description: `Changed invoice ${invoice.number} status to "${action.status}"`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Invoice ${invoice.number} status changed to "${action.status}"`, data: invoice });
      }

      case "update_stock": {
        const existingProduct = await prisma.product.findFirst({ where: { id: action.id, organizationId: orgId } });
        if (!existingProduct) return NextResponse.json({ error: `Product not found with ID: ${action.id}` }, { status: 404 });
        const product = await prisma.product.update({ where: { id: action.id }, data: { quantity: action.quantity } });
        await logAudit({ session, action: "update", entity: "product", entityId: product.id, description: `Updated stock for "${product.name}" from ${existingProduct.quantity} to ${action.quantity}`, method: "ai", metadata: action });
        return NextResponse.json({ success: true, message: `Stock for "${product.name}" updated to ${action.quantity}`, data: product });
      }

      default:
        return NextResponse.json({ error: `Unknown action type: ${action.type}` }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error("AI action execution error:", error);
    const prismaError = error && typeof error === "object" && "code" in error;
    if (prismaError && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Record not found. The AI may have used an incorrect ID. Please try again." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to execute action. Please check the data and try again." }, { status: 500 });
  }
}
