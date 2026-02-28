import React, { useState, useEffect, useRef } from 'react';
import { Mail, Settings, Send, AlertCircle, CheckCircle2, Server, Shield, User, Key, FileText, Loader2, Pause, Play, XCircle, X } from 'lucide-react';

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'compose' | 'settings' | 'logs'>('settings');
  
  // SMTP Settings State
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [connectionMode, setConnectionMode] = useState<'auth' | 'anonymous' | 'starttls'>('auth');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Email Compose State
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isHtml, setIsHtml] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  // Sending Options
  const [sendCount, setSendCount] = useState(1);
  const [sendDelay, setSendDelay] = useState(1000);

  // Status State
  const [sendingState, setSendingState] = useState<'idle' | 'sending' | 'paused'>('idle');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [logs, setLogs] = useState<{ type: 'success' | 'error' | 'info'; message: string; timestamp: Date; details?: any }[]>([]);

  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);

  // Load saved state
  useEffect(() => {
    const saved = localStorage.getItem('smtpTesterState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.smtpHost) setSmtpHost(parsed.smtpHost);
        if (parsed.smtpPort) setSmtpPort(parsed.smtpPort);
        if (parsed.connectionMode) setConnectionMode(parsed.connectionMode);
        if (parsed.username) setUsername(parsed.username);
        if (parsed.password) setPassword(parsed.password);
        if (parsed.from) setFrom(parsed.from);
        if (parsed.to) setTo(parsed.to);
        if (parsed.cc) setCc(parsed.cc);
        if (parsed.bcc) setBcc(parsed.bcc);
        if (parsed.subject) setSubject(parsed.subject);
        if (parsed.body) setBody(parsed.body);
        if (parsed.isHtml !== undefined) setIsHtml(parsed.isHtml);
        if (parsed.sendCount) setSendCount(parsed.sendCount);
        if (parsed.sendDelay !== undefined) setSendDelay(parsed.sendDelay);
      } catch (e) {}
    }
  }, []);

  // Save state
  useEffect(() => {
    const stateToSave = {
      smtpHost, smtpPort, connectionMode, username, password,
      from, to, cc, bcc, subject, body, isHtml, sendCount, sendDelay
    };
    localStorage.setItem('smtpTesterState', JSON.stringify(stateToSave));
  }, [smtpHost, smtpPort, connectionMode, username, password, from, to, cc, bcc, subject, body, isHtml, sendCount, sendDelay]);

  const addLog = (type: 'success' | 'error' | 'info', message: string, details?: any) => {
    setLogs(prev => [{ type, message, timestamp: new Date(), details }, ...prev]);
  };

  const handleTestConnection = async () => {
    if (!smtpHost || !smtpPort) {
      addLog('error', 'Missing required fields (Host, Port).');
      setActiveTab('logs');
      return;
    }

    setIsTestingConnection(true);
    addLog('info', `Testing connection to ${smtpHost}:${smtpPort}...`);
    setActiveTab('logs');

    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          connectionMode,
          username,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        addLog('success', 'Connection successful!', data);
      } else {
        addLog('error', `Connection failed: ${data.error}`, data.details);
      }
    } catch (error: any) {
      addLog('error', `Network error: ${error.message}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!smtpHost || !smtpPort || !from || !to) {
      addLog('error', 'Missing required fields (Host, Port, From, To).');
      setActiveTab('logs');
      return;
    }

    setSendingState('sending');
    setSentCount(0);
    isPausedRef.current = false;
    isCancelledRef.current = false;
    setActiveTab('logs');

    addLog('info', `Starting batch: ${sendCount} email(s) via ${smtpHost}:${smtpPort}`);

    for (let i = 0; i < sendCount; i++) {
      // Check pause
      while (isPausedRef.current) {
        if (isCancelledRef.current) break;
        await new Promise(r => setTimeout(r, 500));
      }
      if (isCancelledRef.current) {
        addLog('info', 'Batch sending cancelled by user.');
        break;
      }

      try {
        const formData = new FormData();
        formData.append('smtpHost', smtpHost);
        formData.append('smtpPort', smtpPort);
        formData.append('connectionMode', connectionMode);
        formData.append('username', username);
        formData.append('password', password);
        formData.append('from', from);
        formData.append('to', to);
        formData.append('cc', cc);
        formData.append('bcc', bcc);
        formData.append('subject', sendCount > 1 ? `${subject} (${i + 1}/${sendCount})` : subject);
        formData.append('body', body);
        formData.append('isHtml', isHtml.toString());
        
        attachments.forEach(file => {
          formData.append('attachments', file);
        });

        const startTime = Date.now();
        const response = await fetch('/api/send-email', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        if (response.ok && data.success) {
          addLog('success', `[${i + 1}/${sendCount}] Successfully sent to ${to} (${duration}ms)`, {
            messageId: data.messageId,
            response: data.response,
            envelope: data.envelope
          });
        } else {
          addLog('error', `[${i + 1}/${sendCount}] Failed to send to ${to}: ${data.error} (${duration}ms)`, data.details || data);
        }
      } catch (error: any) {
        addLog('error', `[${i + 1}/${sendCount}] Network error: ${error.message}`);
      }

      setSentCount(i + 1);

      // Delay before next email, unless it's the last one or cancelled
      if (i < sendCount - 1 && !isCancelledRef.current) {
        let waited = 0;
        while (waited < sendDelay) {
          if (isCancelledRef.current) break;
          while (isPausedRef.current) {
            if (isCancelledRef.current) break;
            await new Promise(r => setTimeout(r, 500));
          }
          await new Promise(r => setTimeout(r, 100));
          waited += 100;
        }
      }
    }

    if (!isCancelledRef.current) {
      addLog('info', 'Sending process completed.');
    }
    setSendingState('idle');
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">SMTP Tester</h1>
          </div>
          <nav className="flex space-x-1">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'settings' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button
              onClick={() => setActiveTab('compose')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'compose' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              Compose
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'logs' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Server className="w-4 h-4" />
              Logs
              {logs.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs font-bold ml-1">
                  {logs.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
          
          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-zinc-900 flex items-center gap-2">
                  <Server className="w-5 h-5 text-zinc-400" />
                  SMTP Server Configuration
                </h2>
                <p className="text-sm text-zinc-500 mt-1">Configure the mail gateway or SMTP server details you want to test.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Port</label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      placeholder="587"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Connection Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setConnectionMode('auth')}
                        className={`px-3 py-2 text-sm font-medium rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                          connectionMode === 'auth' 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        <Shield className="w-4 h-4" />
                        Auth
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnectionMode('anonymous')}
                        className={`px-3 py-2 text-sm font-medium rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                          connectionMode === 'anonymous' 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        <User className="w-4 h-4" />
                        Anon
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnectionMode('starttls')}
                        className={`px-3 py-2 text-sm font-medium rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                          connectionMode === 'starttls' 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        <Key className="w-4 h-4" />
                        STARTTLS
                      </button>
                    </div>
                  </div>

                  {(connectionMode === 'auth' || connectionMode === 'starttls') && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Username</label>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="user@example.com"
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-8 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || !smtpHost || !smtpPort}
                  className="bg-white border border-zinc-300 text-zinc-700 px-4 py-2 rounded-lg font-medium hover:bg-zinc-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTestingConnection ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Server className="w-4 h-4" />
                      Test Connection
                    </>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('compose')}
                  className="bg-zinc-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  Next: Compose Email
                  <FileText className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* COMPOSE TAB */}
          {activeTab === 'compose' && (
            <form onSubmit={handleSend} className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-zinc-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-zinc-400" />
                  Compose Test Email
                </h2>
                <p className="text-sm text-zinc-500 mt-1">Draft the email you want to send through the configured gateway.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">From</label>
                    <input
                      type="email"
                      required
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      placeholder="sender@example.com"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">To</label>
                    <input
                      type="email"
                      required
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="recipient@example.com"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">CC <span className="text-zinc-400 font-normal">(Optional)</span></label>
                    <input
                      type="email"
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="cc@example.com"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">BCC <span className="text-zinc-400 font-normal">(Optional)</span></label>
                    <input
                      type="email"
                      value={bcc}
                      onChange={(e) => setBcc(e.target.value)}
                      placeholder="bcc@example.com"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Test Email Subject"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-zinc-700">Body</label>
                    <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isHtml}
                        onChange={(e) => setIsHtml(e.target.checked)}
                        className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Send as HTML
                    </label>
                  </div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    placeholder="Type your message here..."
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-y font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Attachments</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                        // Reset input value so the same file can be selected again if removed
                        e.target.value = '';
                      }
                    }}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  {attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {attachments.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                            <span className="truncate font-medium text-zinc-700">{file.name}</span>
                            <span className="text-zinc-500 shrink-0">({formatFileSize(file.size)})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                            className="text-zinc-400 hover:text-rose-500 transition-colors ml-2 shrink-0"
                            title="Remove attachment"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-zinc-100">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Number of Emails</label>
                    <input
                      type="number"
                      min="1"
                      value={sendCount}
                      onChange={(e) => setSendCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Delay Between Emails (ms)</label>
                    <input
                      type="number"
                      min="0"
                      value={sendDelay}
                      onChange={(e) => setSendDelay(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-zinc-100 flex items-center justify-between">
                <div className="text-sm text-zinc-500">
                  Sending via <span className="font-medium text-zinc-900">{smtpHost || 'unconfigured host'}</span>:{smtpPort || '587'}
                </div>
                <div className="flex items-center gap-3">
                  {sendingState === 'idle' ? (
                    <button
                      type="submit"
                      disabled={!smtpHost || !smtpPort || !from || !to}
                      className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                      Send {sendCount > 1 ? `${sendCount} Emails` : 'Test Email'}
                    </button>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-indigo-600 mr-2">
                        {sentCount} / {sendCount} Sent
                      </div>
                      {sendingState === 'sending' ? (
                        <button
                          type="button"
                          onClick={() => {
                            isPausedRef.current = true;
                            setSendingState('paused');
                            addLog('info', 'Sending paused.');
                          }}
                          className="bg-amber-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-amber-600 transition-colors flex items-center gap-2"
                        >
                          <Pause className="w-4 h-4" />
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            isPausedRef.current = false;
                            setSendingState('sending');
                            addLog('info', 'Sending resumed.');
                          }}
                          className="bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Resume
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          isCancelledRef.current = true;
                          isPausedRef.current = false; // unpause to allow loop to exit
                          setSendingState('idle');
                        }}
                        className="bg-rose-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-rose-600 transition-colors flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </form>
          )}

          {/* LOGS TAB */}
          {activeTab === 'logs' && (
            <div className="flex flex-col h-[600px]">
              <div className="p-6 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                <div>
                  <h2 className="text-lg font-medium text-zinc-900 flex items-center gap-2">
                    <Server className="w-5 h-5 text-zinc-400" />
                    Execution Logs
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">Real-time results of your SMTP connection tests.</p>
                </div>
                <button
                  onClick={() => setLogs([])}
                  className="text-sm text-zinc-500 hover:text-zinc-900 font-medium px-3 py-1.5 rounded-md hover:bg-zinc-200 transition-colors"
                >
                  Clear Logs
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 bg-zinc-900 text-zinc-300 font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                    <Server className="w-12 h-12 mb-4 opacity-20" />
                    <p>No logs yet. Send a test email to see results.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {logs.map((log, index) => (
                      <div key={index} className="border-l-2 pl-4 py-1 border-zinc-700">
                        <div className="flex items-start gap-3">
                          <span className="text-zinc-500 shrink-0 mt-0.5">
                            [{log.timestamp.toLocaleTimeString()}]
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {log.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                              {log.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500" />}
                              {log.type === 'info' && <Server className="w-4 h-4 text-blue-400" />}
                              <span className={`font-medium ${
                                log.type === 'success' ? 'text-emerald-400' : 
                                log.type === 'error' ? 'text-rose-400' : 'text-blue-300'
                              }`}>
                                {log.message}
                              </span>
                            </div>
                            {log.details && (
                              <div className="mt-2 p-3 bg-black/30 rounded-lg overflow-x-auto text-xs text-zinc-400 border border-zinc-800">
                                {log.details.response && (
                                  <div className="mb-1 text-emerald-400/90">
                                    <span className="text-zinc-500 mr-2">SMTP Response:</span>
                                    {log.details.response}
                                  </div>
                                )}
                                {log.details.messageId && (
                                  <div className="mb-1">
                                    <span className="text-zinc-500 mr-2">Message ID:</span>
                                    {log.details.messageId}
                                  </div>
                                )}
                                {log.details.envelope && (
                                  <div className="mb-1">
                                    <span className="text-zinc-500 mr-2">Envelope:</span>
                                    From: {log.details.envelope.from} | To: {log.details.envelope.to?.join(', ')}
                                  </div>
                                )}
                                {(!log.details.response && !log.details.messageId) || log.type === 'error' ? (
                                  <pre className="mt-2 text-zinc-500">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
