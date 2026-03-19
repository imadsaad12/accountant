"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, Bot, User, Download, Loader2, ShieldCheck, ShieldX, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ActionData { type: string; confirmMessage?: string; [key: string]: any; }

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: ActionData | null;
  actionStatus?: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
  actionResult?: string;
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("en-US");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.role) setUserRole(data.role);
    }).catch(() => {});
  }, []);

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
    // Allow detection of multiple languages for mixed speech
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

      // Auto-send after 2s of silence following a final result
      if (finalTranscript.trim()) {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          recognition.stop();
          setIsListening(false);
          handleSend(finalTranscript.trim());
          finalTranscript = "";
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
        }),
      });

      const data = await res.json();
      const isWriteAction = data.action && !["export_invoices", "export_pdf", "export_report"].includes(data.action.type);
      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
        action: data.action,
        actionStatus: data.action ? (isWriteAction ? "pending" : undefined) : undefined,
      };
      const newMessages = [...updatedMessages, assistantMessage];
      setMessages(newMessages);

      // Auto-execute read-only actions (exports) without confirmation
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
          body: JSON.stringify({ invoiceId: inv.id, language: action.language || inv.language || "fr" }),
        });
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${inv.number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else if (action.type === "export_pdf" && action.invoiceId) {
      const pdfRes = await fetch("/api/invoices/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: action.invoiceId, language: action.language || "fr" }),
      });
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${action.invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (action.type === "export_report") {
      const pdfRes = await fetch("/api/ai/report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: action.title, sections: action.sections }),
      });
      if (pdfRes.ok) {
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(action.title || "report").replace(/\s+/g, "-").toLowerCase()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
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

      setMessages(prev => prev.map((m, i) => {
        if (i === msgIndex) {
          return { ...m, actionStatus: data.success ? "executed" as const : "failed" as const, actionResult: data.message || data.error };
        }
        return m;
      }));

      if (data.success) {
        setMessages(prev => [...prev, { role: "assistant", content: `✅ ${data.message}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `❌ ${data.error || "Action failed"}` }]);
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

  return (
    <PermissionGuard feature="ai">
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">AI Assistant</h1>
          <p className="text-sm text-text-muted">Talk to your business assistant using text or voice in English, French, or Arabic</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-muted">Voice Language:</label>
          <select
            value={speechLang}
            onChange={e => setSpeechLang(e.target.value)}
            className="px-3 py-1.5 bg-dark-input border border-dark-border rounded-lg text-sm text-text-primary focus:ring-accent focus:border-accent"
          >
            <option value="en-US">English</option>
            <option value="fr-FR">Français</option>
            <option value="ar-LB">عربي (لبناني)</option>
            <option value="ar-SA">عربي (فصحى)</option>
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-dark-card rounded-xl border border-dark-border p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted space-y-4">
            <Bot size={48} />
            <div className="text-center">
              <p className="font-medium text-text-muted">How can I help you today?</p>
              <p className="text-sm mt-2">Try asking me:</p>
              <div className="mt-3 space-y-2 text-sm">
                <p className="bg-dark-bg border border-dark-border px-4 py-2 rounded-lg">&quot;Show me a summary of this month&apos;s revenue&quot;</p>
                <p className="bg-dark-bg border border-dark-border px-4 py-2 rounded-lg">&quot;Export all invoices from January to March&quot;</p>
                <p className="bg-dark-bg border border-dark-border px-4 py-2 rounded-lg">&quot;Which products are low on stock?&quot;</p>
                <p className="bg-dark-bg border border-dark-border px-4 py-2 rounded-lg">&quot;Add a new client called Tech Solutions with email info@techsol.com&quot;</p>
                <p className="bg-dark-bg border border-dark-border px-4 py-2 rounded-lg">&quot;بدي ضيف client جديد اسمو Ahmad&quot; (Lebanese)</p>
                <p className="bg-dark-bg border border-dark-border px-4 py-2 rounded-lg">&quot;Update the stock of USB-C Hub to 50&quot;</p>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-accent" />
              </div>
            )}
            <div className={`max-w-[70%] px-4 py-3 rounded-xl text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-accent text-white"
                : "bg-dark-bg border border-dark-border text-text-secondary"
            }`}>
              {msg.content}

              {/* Confirmation dialog for write actions */}
              {msg.action && msg.actionStatus === "pending" && (
                <div className="mt-3 pt-3 border-t border-dark-border/50 -mx-4 -mb-3 px-4 pb-3 bg-amber-500/5 rounded-b-xl">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-400 mb-1">Action requires confirmation</p>
                      <p className="text-xs text-text-secondary">{msg.action.confirmMessage || `Execute: ${msg.action.type}`}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmAction(i)}
                      disabled={executing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                    >
                      {executing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      Confirm
                    </button>
                    <button
                      onClick={() => cancelAction(i)}
                      disabled={executing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                    >
                      <XCircle size={12} />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action executed successfully */}
              {msg.action && msg.actionStatus === "executed" && (
                <div className="mt-2 pt-2 border-t border-dark-border/50 flex items-center gap-2 text-xs -mx-4 -mb-3 px-4 py-2 rounded-b-xl bg-emerald-500/10 text-emerald-400">
                  <ShieldCheck size={14} />
                  <span>{msg.actionResult || `Action executed: ${msg.action.type}`}</span>
                </div>
              )}

              {/* Action cancelled */}
              {msg.action && msg.actionStatus === "cancelled" && (
                <div className="mt-2 pt-2 border-t border-dark-border/50 flex items-center gap-2 text-xs -mx-4 -mb-3 px-4 py-2 rounded-b-xl bg-slate-500/10 text-slate-400">
                  <ShieldX size={14} />
                  <span>Action cancelled</span>
                </div>
              )}

              {/* Action failed */}
              {msg.action && msg.actionStatus === "failed" && (
                <div className="mt-2 pt-2 border-t border-dark-border/50 flex items-center gap-2 text-xs -mx-4 -mb-3 px-4 py-2 rounded-b-xl bg-red-500/10 text-red-400">
                  <XCircle size={14} />
                  <span>{msg.actionResult || "Action failed"}</span>
                </div>
              )}

              {/* Export action auto-executed (no confirmation needed) */}
              {msg.action && !msg.actionStatus && (
                <div className="mt-2 pt-2 border-t border-dark-border/50 flex items-center gap-2 text-xs bg-accent/10 text-accent -mx-4 -mb-3 px-4 py-2 rounded-b-xl">
                  <Download size={14} />
                  <span>Export completed: {msg.action.type}</span>
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-dark-border flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-text-secondary" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-accent" />
            </div>
            <div className="bg-dark-bg border border-dark-border px-4 py-3 rounded-xl">
              <Loader2 size={16} className="animate-spin text-accent" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`p-3 rounded-xl transition-colors ${
            isListening
              ? "bg-red-500 text-white animate-pulse"
              : "bg-dark-card text-text-muted hover:bg-dark-card-hover hover:text-accent"
          }`}
          title={isListening ? "Stop recording" : "Start voice input"}
        >
          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder={isListening ? "Listening..." : "Type your message or click the mic..."}
          className="flex-1 px-4 py-3 bg-dark-input border border-dark-border rounded-xl focus:ring-accent focus:border-accent text-sm text-text-primary placeholder:text-text-muted"
          disabled={isListening}
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          className="p-3 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
    </PermissionGuard>
  );
}
