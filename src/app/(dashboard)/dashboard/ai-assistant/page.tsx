"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Send, Bot, User, Download, Loader2, ShieldCheck, ShieldX, CheckCircle, XCircle, AlertTriangle, Plus, MessageSquare, Trash2, Sparkles, ChevronDown } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useLang } from "@/components/LanguageProvider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ActionData { type: string; confirmMessage?: string; actions?: ActionData[]; [key: string]: any; }

interface BulkResult { action: ActionData; success: boolean; message: string; }

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: ActionData | null;
  actionStatus?: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
  actionResult?: string;
  bulkResults?: BulkResult[];
}

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("en-US");
  const appLang = useLang();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Chat persistence state
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showChatDropdown, setShowChatDropdown] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.role) setUserRole(data.role);
    }).catch(() => {});
  }, []);

  // Load chat list on mount
  useEffect(() => {
    loadChats();
  }, []);

  async function loadChats() {
    setLoadingChats(true);
    try {
      const res = await fetch("/api/ai/chats");
      if (res.ok) setChats(await res.json());
    } catch { /* ignore */ }
    setLoadingChats(false);
  }

  async function loadChat(chatId: string) {
    const res = await fetch(`/api/ai/chats/${chatId}`);
    if (res.ok) {
      const data = await res.json();
      setActiveChatId(chatId);
      setMessages(data.messages || []);
    }
  }

  const saveChat = useCallback(async (msgs: Message[], chatId: string | null) => {
    if (msgs.length === 0) return;
    setSavingChat(true);

    // Generate title from first user message
    const firstUserMsg = msgs.find(m => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? "..." : "")
      : "New Chat";

    // Strip non-serializable fields for storage
    const cleanMessages = msgs.map(m => ({
      role: m.role,
      content: m.content,
      action: m.action || undefined,
      actionStatus: m.actionStatus || undefined,
      actionResult: m.actionResult || undefined,
    }));

    try {
      if (chatId) {
        // Update existing chat
        await fetch(`/api/ai/chats/${chatId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, messages: cleanMessages }),
        });
      } else {
        // Create new chat
        const res = await fetch("/api/ai/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, messages: cleanMessages }),
        });
        if (res.ok) {
          const newChat = await res.json();
          setActiveChatId(newChat.id);
        }
      }
      await loadChats();
    } catch { /* ignore */ }
    setSavingChat(false);
  }, []);

  // Auto-save with debounce whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveChat(messages, activeChatId);
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, activeChatId, saveChat]);

  function startNewChat() {
    setActiveChatId(null);
    setMessages([]);
    setInput("");
  }

  async function deleteChat(chatId: string) {
    await fetch(`/api/ai/chats/${chatId}`, { method: "DELETE" });
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
    }
    await loadChats();
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLang;
    if (speechLang === "ar-LB") {
      recognition.lang = "ar";
    }

    let finalTranscript = "";
    let silenceTimer: NodeJS.Timeout | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          interim = event.results[i][0].transcript;
        }
      }
      setInput((finalTranscript + interim).trim());

      if (finalTranscript.trim()) {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          const text = finalTranscript.trim();
          finalTranscript = "";
          recognition.stop();
          setIsListening(false);
          handleSend(text);
        }, 2000);
      }
    };

    recognition.onerror = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      setIsListening(false);
      if (finalTranscript.trim()) {
        const text = finalTranscript.trim();
        finalTranscript = "";
        handleSend(text);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  async function handleSend(textOverride?: string) {
    const text = textOverride || input;
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          language: appLang,
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setMessages([...updatedMessages, {
          role: "assistant",
          content: "**AI token limit reached.** Your organization has used all available AI tokens for this period. Please contact your administrator to increase the limit or reset your usage.",
        }]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setMessages([...updatedMessages, { role: "assistant", content: `Sorry, something went wrong (${res.status}). Please try again.` }]);
        setLoading(false);
        return;
      }

      const isWriteAction = data.action && !["export_invoices", "export_pdf", "export_report", "export_clients_pdf", "export_stock_pdf", "export_employees_pdf", "export_suppliers_pdf"].includes(data.action.type);
      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
        action: data.action,
        actionStatus: data.action ? (isWriteAction ? "pending" : undefined) : undefined,
      };
      const newMessages = [...updatedMessages, assistantMessage];
      setMessages(newMessages);

      if (data.action && !isWriteAction) {
        await handleExportAction(data.action);
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, actionStatus: "executed" as const } : m));
      }
    } catch {
      setMessages([...updatedMessages, { role: "assistant", content: "Sorry, I encountered an error. Please make sure your Anthropic API key is configured in the .env file." }]);
    }

    setLoading(false);
  }

  async function handleExportAction(action: ActionData) {
    if (action.type === "export_invoices") {
      const params = new URLSearchParams();
      if (action.from) params.set("from", action.from);
      if (action.to) params.set("to", action.to);

      const res = await fetch(`/api/invoices?${params}`);
      const invoices = await res.json();

      if (invoices.length === 0) {
        setMessages(prev => [...prev, { role: "assistant", content: "No invoices found for that date range." }]);
        return;
      }

      for (const inv of invoices) {
        const pdfRes = await fetch("/api/invoices/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: inv.id, language: action.language === "fr" ? "fr" : "en" }),
        });
        const blob = await pdfRes.blob();
        downloadBlob(blob, `${inv.number}.pdf`);
      }
    } else if (action.type === "export_pdf" && action.invoiceId) {
      const pdfRes = await fetch("/api/invoices/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: action.invoiceId, language: action.language === "fr" ? "fr" : "en" }),
      });
      const blob = await pdfRes.blob();
      downloadBlob(blob, `invoice-${action.invoiceId}.pdf`);
    } else if (action.type === "export_report") {
      const pdfRes = await fetch("/api/ai/report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: action.title, sections: action.sections }),
      });
      if (pdfRes.ok) {
        const blob = await pdfRes.blob();
        downloadBlob(blob, `${(action.title || "report").replace(/\s+/g, "-").toLowerCase()}.pdf`);
      }
    } else if (action.type === "export_clients_pdf") {
      const res = await fetch("/api/clients");
      if (res.ok) {
        const clients = await res.json();
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(16); doc.setTextColor(37, 99, 235);
        doc.text("Clients", 14, 16);
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Total: ${clients.length} — ${new Date().toLocaleDateString()}`, 14, 23);
        autoTable(doc, {
          startY: 28,
          head: [["Name", "Email", "Phone", "City", "Total Invoiced", "Total Paid", "Total Pending", "Balance"]],
          body: clients.map((c: { name: string; email: string | null; phone: string | null; city: string | null; totalInvoiced: number; totalPaid: number; totalPending: number; balance: number }) => [
            c.name, c.email || "-", c.phone || "-", c.city || "-",
            c.totalInvoiced.toFixed(2), c.totalPaid.toFixed(2), c.totalPending.toFixed(2), c.balance.toFixed(2),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: "bold" },
          columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
        });
        downloadBlob(doc.output("blob"), `clients-${new Date().toISOString().split("T")[0]}.pdf`);
      }
    } else if (action.type === "export_stock_pdf") {
      const res = await fetch("/api/products");
      if (res.ok) {
        const products = await res.json();
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(16); doc.setTextColor(37, 99, 235);
        doc.text("Stock", 14, 16);
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Total: ${products.length} — ${new Date().toLocaleDateString()}`, 14, 23);
        autoTable(doc, {
          startY: 28,
          head: [["Name", "SKU", "Type", "Category", "Price", "Cost", "Quantity", "Min Stock", "Status"]],
          body: products.map((p: { name: string; sku: string; type: string; category: { name: string } | null; price: number; cost: number; quantity: number; minStock: number; unit: string; components: { quantity: number; component: { quantity: number } }[] }) => {
            const qty = p.type === "composite" && p.components?.length > 0
              ? Math.floor(Math.min(...p.components.map((c: { quantity: number; component: { quantity: number } }) => c.component.quantity / c.quantity)))
              : p.quantity;
            return [p.name, p.sku, p.type, p.category?.name || "-", p.price.toFixed(2), p.cost.toFixed(2), `${qty} ${p.unit}`, String(p.minStock), qty <= p.minStock ? "LOW STOCK" : "OK"];
          }),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: "bold" },
          columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "center" } },
        });
        downloadBlob(doc.output("blob"), `stock-${new Date().toISOString().split("T")[0]}.pdf`);
      }
    } else if (action.type === "export_employees_pdf") {
      const res = await fetch("/api/employees");
      if (res.ok) {
        const employees = await res.json();
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(16); doc.setTextColor(37, 99, 235);
        doc.text("Employees", 14, 16);
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Total: ${employees.length} — ${new Date().toLocaleDateString()}`, 14, 23);
        autoTable(doc, {
          startY: 28,
          head: [["Name", "Email", "Position", "Department", "Salary", "Outstanding Advance", "Hire Date", "Status"]],
          body: employees.map((e: { firstName: string; lastName: string; email: string; position: string; department: string | null; salary: number; salaryPeriod: string; outstandingAdvance: number; hireDate: string; status: string }) => [
            `${e.firstName} ${e.lastName}`, e.email || "-", e.position, e.department || "-",
            `${e.salary.toFixed(2)}/${e.salaryPeriod}`,
            e.outstandingAdvance > 0 ? e.outstandingAdvance.toFixed(2) : "-",
            e.hireDate ? new Date(e.hireDate).toLocaleDateString("en-GB") : "-",
            e.status,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: "bold" },
          columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
        });
        downloadBlob(doc.output("blob"), `employees-${new Date().toISOString().split("T")[0]}.pdf`);
      }
    } else if (action.type === "export_suppliers_pdf") {
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        const suppliers = await res.json();
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(16); doc.setTextColor(37, 99, 235);
        doc.text("Suppliers", 14, 16);
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Total: ${suppliers.length} — ${new Date().toLocaleDateString()}`, 14, 23);
        autoTable(doc, {
          startY: 28,
          head: [["Name", "Contact", "Email", "Phone", "City", "Payment Terms"]],
          body: suppliers.map((s: { name: string; contactName: string | null; email: string | null; phone: string | null; city: string | null; paymentTerms: number | null }) => [
            s.name, s.contactName || "-", s.email || "-", s.phone || "-", s.city || "-",
            s.paymentTerms != null ? `${s.paymentTerms} days` : "-",
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: "bold" },
        });
        downloadBlob(doc.output("blob"), `suppliers-${new Date().toISOString().split("T")[0]}.pdf`);
      }
    }
  }

  async function confirmAction(msgIndex: number) {
    const msg = messages[msgIndex];
    if (!msg.action) return;

    setExecuting(true);
    try {
      const res = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: msg.action }),
      });
      const data = await res.json();
      const isBulk = msg.action.type === "bulk_actions";

      setMessages(prev => prev.map((m, i) => {
        if (i === msgIndex) {
          return {
            ...m,
            actionStatus: data.success ? "executed" as const : "failed" as const,
            actionResult: data.message || data.error,
            bulkResults: isBulk ? data.results : undefined,
          };
        }
        return m;
      }));

      if (data.success) {
        setMessages(prev => [...prev, { role: "assistant", content: `Done. ${data.message}` }]);
      } else if (isBulk && data.results) {
        const failedItems = (data.results as BulkResult[]).filter(r => !r.success);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `${data.message}\n\nFailed:\n${failedItems.map(r => `- ${r.message}`).join("\n")}`,
        }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `${data.error || "Action failed"}` }]);
      }
    } catch {
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "failed" as const, actionResult: "Network error" } : m));
    }
    setExecuting(false);
  }

  function cancelAction(msgIndex: number) {
    setMessages(prev => prev.map((m, i) => {
      if (i === msgIndex) {
        return { ...m, actionStatus: "cancelled" as const };
      }
      return m;
    }));
    setMessages(prev => [...prev, { role: "assistant", content: "Action cancelled. Let me know if you need anything else." }]);
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowChatDropdown(false);
      }
    }
    if (showChatDropdown) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showChatDropdown]);

  const activeTitle = chats.find(c => c.id === activeChatId)?.title || "New Chat";

  const suggestions = [
    "Show me this month's revenue summary",
    "Export all invoices from this month",
    "Which products are low on stock?",
    "Show clients with outstanding balances",
    "What is the balance of account 1000?",
    "Create a journal entry",
  ];

  return (
    <PermissionGuard feature="ai">
    <div className="flex flex-col h-[calc(100vh-3rem)] bg-dark-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-dark-border bg-dark-sidebar/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center shadow-lg shadow-accent/20">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-dark-sidebar" />
          </div>
          <div>
            <h1 className="text-base font-bold text-text-primary">AI Assistant</h1>
            <p className="text-[11px] text-text-muted">EN / FR / AR</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Chat dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowChatDropdown(!showChatDropdown)}
              className="flex items-center gap-2 px-3 py-2 bg-dark-card border border-dark-border rounded-xl text-xs text-text-primary hover:border-accent/30 transition-colors max-w-[200px]"
            >
              <MessageSquare size={14} className="text-text-muted flex-shrink-0" />
              <span className="truncate">{activeTitle}</span>
              <ChevronDown size={14} className={`text-text-muted flex-shrink-0 transition-transform ${showChatDropdown ? "rotate-180" : ""}`} />
            </button>

            {showChatDropdown && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-dark-card border border-dark-border rounded-xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
                {/* New chat button */}
                <div className="p-2 border-b border-dark-border">
                  <button
                    onClick={() => { startNewChat(); setShowChatDropdown(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover transition-colors"
                  >
                    <Plus size={14} /> New Chat
                  </button>
                </div>

                {/* Chat list */}
                <div className="max-h-64 overflow-y-auto">
                  {loadingChats ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={16} className="animate-spin text-accent" />
                    </div>
                  ) : chats.length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-6">No saved chats</p>
                  ) : (
                    <div className="p-1.5">
                      {chats.map(chat => (
                        <div
                          key={chat.id}
                          className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-xs transition-colors ${
                            activeChatId === chat.id
                              ? "bg-accent/15 text-accent"
                              : "text-text-secondary hover:bg-dark-bg"
                          }`}
                          onClick={() => { loadChat(chat.id); setShowChatDropdown(false); }}
                        >
                          <MessageSquare size={12} className="flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">{chat.title}</p>
                            <p className="text-[10px] text-text-muted mt-0.5">{formatTime(chat.updatedAt)}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted hover:text-red-400 transition-opacity"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {savingChat && (
                  <div className="px-3 py-2 border-t border-dark-border flex items-center gap-2 text-[10px] text-accent">
                    <Loader2 size={10} className="animate-spin" /> Saving...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Voice language */}
          <select
            value={speechLang}
            onChange={e => setSpeechLang(e.target.value)}
            className="px-3 py-2 bg-dark-card border border-dark-border rounded-xl text-xs text-text-primary hover:border-accent/30 transition-colors cursor-pointer focus:outline-none focus:border-accent/50"
          >
            <option value="en-US">English</option>
            <option value="fr-FR">Fran&ccedil;ais</option>
            <option value="ar-LB">&#1593;&#1585;&#1576;&#1610; (&#1604;&#1576;&#1606;&#1575;&#1606;&#1610;)</option>
            <option value="ar-SA">&#1593;&#1585;&#1576;&#1610; (&#1601;&#1589;&#1581;&#1609;)</option>
          </select>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full max-w-xl mx-auto">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent to-accent/50 flex items-center justify-center shadow-xl shadow-accent/20">
              <Sparkles size={24} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">How can I help you?</h2>
            <p className="text-xs text-text-muted mb-6">Ask about your business data, reports, or manage records</p>

            <div className="flex flex-wrap justify-center gap-2 w-full">
              {suggestions.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="px-3.5 py-2 text-xs rounded-xl border border-dark-border bg-dark-card/50 text-text-muted hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot size={16} className="text-accent" />
              </div>
            )}
            <div dir="auto" className={`max-w-[75%] text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "px-4 py-3 rounded-2xl rounded-br-md bg-accent text-white shadow-lg shadow-accent/10"
                : "px-5 py-4 rounded-2xl rounded-bl-md bg-dark-card border border-dark-border text-text-secondary shadow-sm"
            }`}>
              {msg.content}

              {/* Confirmation dialog for write actions */}
              {msg.action && msg.actionStatus === "pending" && (
                <div className="mt-4 pt-3 border-t border-dark-border/30 -mx-5 -mb-4 px-5 pb-4 bg-amber-500/5 rounded-b-2xl">
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertTriangle size={14} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-400 mb-1">
                        {msg.action.type === "bulk_actions"
                          ? `Bulk action — ${msg.action.actions?.length ?? 0} operations`
                          : "Action requires confirmation"}
                      </p>
                      <p className="text-xs text-text-secondary/80">{msg.action.confirmMessage || `Execute: ${msg.action.type}`}</p>
                      {msg.action.type === "bulk_actions" && msg.action.actions && msg.action.actions.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {msg.action.actions.map((a: ActionData, idx: number) => (
                            <li key={idx} className="text-xs text-text-muted flex items-start gap-1.5">
                              <span className="text-amber-500 mt-px">-</span>
                              <span>{a.confirmMessage || a.type}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmAction(i)}
                      disabled={executing}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/25 disabled:opacity-50 transition-all active:scale-[0.97]"
                    >
                      {executing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      {msg.action.type === "bulk_actions" ? `Confirm all ${msg.action.actions?.length ?? ""}` : "Confirm"}
                    </button>
                    <button
                      onClick={() => cancelAction(i)}
                      disabled={executing}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/25 disabled:opacity-50 transition-all active:scale-[0.97]"
                    >
                      <XCircle size={12} />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {msg.action && msg.actionStatus === "executed" && (
                <div className="mt-3 pt-3 border-t border-dark-border/30 -mx-5 -mb-4 px-5 py-3 rounded-b-2xl bg-emerald-500/10">
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <ShieldCheck size={14} />
                    <span className="font-medium">{msg.actionResult || `Action executed: ${msg.action.type}`}</span>
                  </div>
                  {msg.bulkResults && msg.bulkResults.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {msg.bulkResults.map((r, idx) => (
                        <li key={idx} className={`text-xs flex items-start gap-1.5 ${r.success ? "text-emerald-400/80" : "text-red-400"}`}>
                          <span className="mt-px">{r.success ? "OK" : "FAIL"}</span>
                          <span>{r.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {msg.action && msg.actionStatus === "cancelled" && (
                <div className="mt-3 pt-3 border-t border-dark-border/30 flex items-center gap-2 text-xs -mx-5 -mb-4 px-5 py-3 rounded-b-2xl bg-slate-500/10 text-slate-400">
                  <ShieldX size={14} />
                  <span>Action cancelled</span>
                </div>
              )}

              {msg.action && msg.actionStatus === "failed" && (
                <div className="mt-3 pt-3 border-t border-dark-border/30 flex items-center gap-2 text-xs -mx-5 -mb-4 px-5 py-3 rounded-b-2xl bg-red-500/10 text-red-400">
                  <XCircle size={14} />
                  <span>{msg.actionResult || "Action failed"}</span>
                </div>
              )}

              {msg.action && !msg.actionStatus && (
                <div className="mt-3 pt-3 border-t border-dark-border/30 flex items-center gap-2 text-xs bg-accent/10 text-accent -mx-5 -mb-4 px-5 py-3 rounded-b-2xl">
                  <Download size={14} />
                  <span className="font-medium">Export completed: {msg.action.type}</span>
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-dark-card border border-dark-border flex items-center justify-center flex-shrink-0 mt-1">
                <User size={14} className="text-text-muted" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center flex-shrink-0 mt-1">
              <Bot size={16} className="text-accent" />
            </div>
            <div className="bg-dark-card border border-dark-border px-5 py-4 rounded-2xl rounded-bl-md shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-4 border-t border-dark-border bg-dark-sidebar/30 backdrop-blur-sm shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`p-3 rounded-xl transition-all flex-shrink-0 ${
              isListening
                ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
                : "bg-dark-card border border-dark-border text-text-muted hover:text-accent hover:border-accent/30"
            }`}
            title={isListening ? "Stop recording" : "Start voice input"}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <div className="flex-1 relative">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={isListening ? "Listening..." : "Ask anything about your business..."}
              className="w-full px-4 py-3 pr-12 bg-dark-card border border-dark-border rounded-xl focus:ring-1 focus:ring-accent/50 focus:border-accent/50 text-sm text-text-primary placeholder:text-text-muted transition-all"
              disabled={isListening}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-30 disabled:hover:bg-accent transition-all active:scale-95"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
    </PermissionGuard>
  );
}
