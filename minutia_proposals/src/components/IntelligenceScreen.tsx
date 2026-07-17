import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Copy, Mic, Sparkles, Check, Play, Square, 
  Plus, Trash2, Edit2, FileText, Wand2, Lightbulb, Grid, 
  Languages, AlertCircle, Info
} from 'lucide-react';
import { Session, TranscriptLine } from '../types';

interface IntelligenceScreenProps {
  session: Session;
  onBackToDashboard: () => void;
  onUpdateSession: (updatedSession: Session) => void;
}

export default function IntelligenceScreen({
  session,
  onBackToDashboard,
  onUpdateSession
}: IntelligenceScreenProps) {
  const [activeTab, setActiveTab] = useState<'resumen' | 'auto' | 'modelo' | 'plantilla'>('resumen');
  const [copied, setCopied] = useState(false);
  const [isRecordingSim, setIsRecordingSim] = useState(false);
  const [newParticipant, setNewParticipant] = useState('');
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [editingTranscriptId, setEditingTranscriptId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  
  // Custom audio recording wave bars simulation
  const [waveBars, setWaveBars] = useState<number[]>([30, 45, 12, 60, 20, 80, 50, 40, 90, 30, 25, 70, 45, 10, 60]);

  // Handle live audio wave motion during recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecordingSim) {
      interval = setInterval(() => {
        setWaveBars(prev => prev.map(() => Math.floor(Math.random() * 85) + 10));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecordingSim]);

  // Copy transcripts to clipboard
  const handleCopyTranscripts = () => {
    const textToCopy = session.transcripts
      .map(t => `[${t.time}] ${t.speaker}: ${t.text}`)
      .join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simulate AI transcription improvement
  const handleImproveTranscript = () => {
    const updated = session.transcripts.map(t => {
      // Fix grammar slightly and capitalize
      let newText = t.text.trim();
      if (newText.length > 0) {
        newText = newText.charAt(0).toUpperCase() + newText.slice(1);
        if (!newText.endsWith('.') && !newText.endsWith('!') && !newText.endsWith('?')) {
          newText += '.';
        }
      }
      return { ...t, text: newText };
    });
    
    onUpdateSession({
      ...session,
      transcripts: updated
    });
  };

  // Add a participant
  const handleAddParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipant.trim()) return;
    onUpdateSession({
      ...session,
      participants: [...session.participants, newParticipant.trim()]
    });
    setNewParticipant('');
    setShowAddParticipant(false);
  };

  // Remove a participant
  const handleRemoveParticipant = (index: number) => {
    const updated = [...session.participants];
    updated.splice(index, 1);
    onUpdateSession({
      ...session,
      participants: updated
    });
  };

  // Edit individual transcript lines
  const startEditingTranscript = (line: TranscriptLine) => {
    setEditingTranscriptId(line.id);
    setEditingText(line.text);
  };

  const saveTranscriptEdit = (id: string) => {
    const updated = session.transcripts.map(t => 
      t.id === id ? { ...t, text: editingText } : t
    );
    onUpdateSession({
      ...session,
      transcripts: updated
    });
    setEditingTranscriptId(null);
  };

  // Trigger simulated live transcription add-on
  const handleToggleRecording = () => {
    if (isRecordingSim) {
      setIsRecordingSim(false);
    } else {
      setIsRecordingSim(true);
      // Automatically add a transcript line after 4 seconds
      setTimeout(() => {
        setIsRecordingSim(prev => {
          if (prev) {
            const now = new Date();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const newTranscript: TranscriptLine = {
              id: `live-${Date.now()}`,
              speaker: 'Hablante 2',
              time: `${minutes}:${seconds}`,
              text: 'Revisé los parámetros del servidor de MinutIA y todo marcha perfectamente.'
            };
            onUpdateSession({
              ...session,
              transcripts: [...session.transcripts, newTranscript]
            });
          }
          return false;
        });
      }, 4000);
    }
  };

  return (
    <div className="bg-grid-subtle min-h-screen text-zinc-100 font-sans flex flex-col relative overflow-hidden" style={{ background: 'radial-gradient(circle at center, #111115 0%, #09090b 100%)' }}>
      
      {/* Top Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur-md" data-purpose="main-navigation">
        
        {/* Logo click returns to dashboard. XPaths match:
            //h1[contains(text(), 'MinutIA')]/parent::div */}
        <div 
          onClick={onBackToDashboard}
          className="flex items-center space-x-3 cursor-pointer group"
          data-purpose="logo"
        >
          <div className="w-8 h-8 bg-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-500/30">
            <span className="text-cyan-400 font-bold text-lg">M</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white group-hover:text-cyan-400 transition-colors">MinutIA</h1>
        </div>

        {/* Navigation menu. XPath matches:
            //a[contains(text(), 'Inicio')] */}
        <div className="flex items-center space-x-10 text-zinc-400 text-sm font-medium">
          <a 
            onClick={onBackToDashboard}
            className="hover:text-cyan-400 transition-colors cursor-pointer"
          >
            Inicio
          </a>
          <a className="text-cyan-450 font-semibold hover:text-cyan-400 transition-colors" href="#reuniones">Reuniones</a>
          <a className="hover:text-cyan-400 transition-colors" href="#ajustes">Ajustes</a>
          <a className="hover:text-cyan-400 transition-colors" href="#nosotros">Nosotros</a>
          
          <button 
            onClick={onBackToDashboard}
            className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center bg-[#161618] hover:bg-zinc-850 transition-all text-zinc-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Main Intelligent Workspace */}
      <main className="flex-grow px-12 py-8 max-w-[1600px] mx-auto w-full grid grid-cols-12 gap-8 items-stretch">
        
        {/* LEFT COLUMN: Intelligent Transcript */}
        <section className="col-span-12 lg:col-span-4 flex flex-col bg-[#161618] border border-zinc-800 rounded-3xl p-6 glow-border-cyan">
          
          {/* Header Actions */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800/80">
            <h2 className="text-md font-bold tracking-tight text-white truncate max-w-[150px]" title="Transcripción Inteligente">
              Transcripción Intel.
            </h2>
            
            <div className="flex items-center space-x-2">
              {/* Copiar Button */}
              <button 
                onClick={handleCopyTranscripts}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-300 hover:text-cyan-400 hover:border-cyan-500/30 transition-all cursor-pointer"
                title="Copiar transcripción completa"
              >
                {copied ? <Check className="w-3 h-3 text-cyan-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                <span>COPIAR</span>
              </button>

              {/* Grabar Button */}
              <button 
                onClick={handleToggleRecording}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
                  isRecordingSim 
                    ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
                }`}
                title="Simular nueva grabación"
              >
                <Mic className={`w-3 h-3 ${isRecordingSim ? 'animate-pulse text-red-400' : 'text-zinc-400'}`} />
                <span>{isRecordingSim ? 'GRABANDO' : 'GRABAR'}</span>
              </button>

              {/* Mejorar Button */}
              <button 
                onClick={handleImproveTranscript}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-300 hover:text-cyan-400 hover:border-cyan-500/30 transition-all cursor-pointer"
                title="Mejorar ortografía y formato con IA"
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>MEJORAR</span>
              </button>
            </div>
          </div>

          {/* Transcript Scrollable Panel */}
          <div className="flex-grow overflow-y-auto max-h-[600px] space-y-4 pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {session.transcripts.map((t) => (
              <div key={t.id} className="group relative space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span className="font-mono text-[10px] tracking-wider uppercase text-zinc-500">[{t.time}] {t.speaker}:</span>
                  <button 
                    onClick={() => startEditingTranscript(t)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-cyan-400 hover:text-cyan-300"
                    title="Editar línea"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
                
                {editingTranscriptId === t.id ? (
                  <div className="space-y-2 bg-zinc-900 p-3 rounded-2xl border border-cyan-500/30">
                    <textarea 
                      className="w-full bg-[#161618] border border-zinc-800 text-xs text-zinc-100 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                      rows={3}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                    />
                    <div className="flex justify-end space-x-2">
                      <button 
                        onClick={() => setEditingTranscriptId(null)}
                        className="px-2.5 py-1 bg-zinc-800 text-[9px] font-bold rounded-lg hover:bg-zinc-700"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={() => saveTranscriptEdit(t.id)}
                        className="px-2.5 py-1 bg-cyan-550 text-[9px] font-bold text-black bg-cyan-400 rounded-lg hover:bg-cyan-300"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 p-3.5 rounded-2xl border border-zinc-800/50 hover:border-zinc-750 transition-all">
                    {t.text || <span className="text-zinc-600 italic text-[11px]">Espacio en blanco...</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CENTER COLUMN: Session details & Recording simulation status */}
        <section className="col-span-12 lg:col-span-3 flex flex-col space-y-6">
          
          {/* Detalles de la Sesión Card */}
          <div className="bg-[#161618] border border-zinc-800 rounded-3xl p-6 flex-grow">
            <h2 className="text-md font-bold text-white tracking-tight mb-6 pb-2 border-b border-zinc-800/80">
              Detalles de la Sesión
            </h2>
            <div className="space-y-5">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">Contexto</span>
                <p className="text-xs text-zinc-300 bg-zinc-900/40 p-3.5 rounded-2xl border border-zinc-800/50 leading-relaxed">
                  {session.context}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">Fecha</span>
                <p className="text-xs text-zinc-300 font-mono bg-zinc-900/40 px-3.5 py-2.5 rounded-2xl border border-zinc-800/50">
                  11_07_26_00_23_20
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">Modelo de IA</span>
                <p className="text-xs text-zinc-300 bg-zinc-900/40 px-3.5 py-2.5 rounded-2xl border border-zinc-800/50 flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-2 animate-pulse"></span>
                  {session.model}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">Idioma</span>
                <p className="text-xs text-zinc-300 bg-zinc-900/40 px-3.5 py-2.5 rounded-2xl border border-zinc-800/50 flex items-center">
                  <Languages className="w-3.5 h-3.5 text-cyan-450 mr-2" />
                  {session.language}
                </p>
              </div>
            </div>
          </div>

          {/* Grabando Waveform Card */}
          <div className="bg-[#161618] border border-zinc-800 rounded-3xl p-6 flex flex-col items-center justify-center min-h-[220px]">
            <div className="relative flex flex-col items-center justify-center w-full">
              
              {/* Mic Icon pulsing circle */}
              <div className={`w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3 relative ${isRecordingSim ? 'animate-pulse' : ''}`}>
                <Mic className={`w-6 h-6 text-cyan-400 ${isRecordingSim ? 'scale-110 text-cyan-300' : ''} transition-transform`} />
                {isRecordingSim && (
                  <span className="absolute inset-0 rounded-full bg-cyan-400/20 animate-ping"></span>
                )}
              </div>
              
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {isRecordingSim ? 'Grabando...' : 'Grabando'}
              </span>

              {/* Dynamic waveform simulation bars */}
              <div className="flex items-end justify-center h-12 space-x-1.5 mt-4 w-full px-4">
                {waveBars.map((height, idx) => (
                  <div 
                    key={idx} 
                    className={`w-1 rounded-full transition-all duration-150 ${
                      isRecordingSim ? 'bg-cyan-400' : 'bg-zinc-800'
                    }`}
                    style={{ height: `${isRecordingSim ? height : 8}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Summary and Intelligence Insights */}
        <section className="col-span-12 lg:col-span-5 flex flex-col bg-[#161618] border border-zinc-800 rounded-3xl p-6 glow-border-cyan">
          
          {/* Tabs header */}
          <div className="grid grid-cols-4 gap-2 mb-6 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800/80">
            <button 
              onClick={() => setActiveTab('resumen')}
              className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center transition-all cursor-pointer ${
                activeTab === 'resumen' 
                  ? 'bg-zinc-800 text-cyan-400 shadow' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <FileText className="w-4 h-4 mb-1" />
              <span className="text-[8px] font-bold uppercase tracking-wider block">Resumen</span>
            </button>

            <button 
              onClick={() => setActiveTab('auto')}
              className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center transition-all cursor-pointer ${
                activeTab === 'auto' 
                  ? 'bg-zinc-800 text-cyan-400 shadow' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Wand2 className="w-4 h-4 mb-1" />
              <span className="text-[8px] font-bold uppercase tracking-wider block">Auto</span>
            </button>

            <button 
              onClick={() => setActiveTab('modelo')}
              className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center transition-all cursor-pointer ${
                activeTab === 'modelo' 
                  ? 'bg-zinc-800 text-cyan-400 shadow' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Lightbulb className="w-4 h-4 mb-1" />
              <span className="text-[8px] font-bold uppercase tracking-wider block">Modelo</span>
            </button>

            <button 
              onClick={() => setActiveTab('plantilla')}
              className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center transition-all cursor-pointer ${
                activeTab === 'plantilla' 
                  ? 'bg-zinc-800 text-cyan-400 shadow' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Grid className="w-4 h-4 mb-1" />
              <span className="text-[8px] font-bold uppercase tracking-wider block">Plantilla</span>
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-grow overflow-y-auto max-h-[580px] space-y-6 pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            
            {/* Summary Section */}
            <div className="space-y-3">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center">
                <span>Resumen Ejecutivo</span>
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800/50">
                {session.summary}
              </p>
            </div>

            {/* Participants Section */}
            <div className="space-y-3 pt-4 border-t border-zinc-800/60">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                  Participantes
                </h3>
                
                <button 
                  onClick={() => setShowAddParticipant(!showAddParticipant)}
                  className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-cyan-400 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {showAddParticipant && (
                <form onSubmit={handleAddParticipant} className="flex gap-2 bg-zinc-900 p-2 rounded-2xl border border-cyan-500/30">
                  <input 
                    type="text"
                    placeholder="Nombre participante..."
                    className="flex-grow bg-[#161618] border border-zinc-800 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-450 text-zinc-200"
                    value={newParticipant}
                    onChange={(e) => setNewParticipant(e.target.value)}
                  />
                  <button type="submit" className="bg-cyan-400 hover:bg-cyan-300 text-black text-xs px-3 py-1.5 rounded-xl font-bold transition-colors">
                    Añadir
                  </button>
                </form>
              )}

              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {session.participants.map((p, idx) => (
                  <li 
                    key={idx} 
                    className="flex items-center justify-between p-2.5 bg-zinc-900/40 hover:bg-zinc-900/80 rounded-xl border border-zinc-800/50 transition-colors group/p"
                  >
                    <span className="text-zinc-300 truncate pr-2">• {p}</span>
                    <button 
                      onClick={() => handleRemoveParticipant(idx)}
                      className="opacity-0 group-hover/p:opacity-100 transition-opacity text-red-400 hover:text-red-300 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Key Topics Section */}
            <div className="space-y-4 pt-4 border-t border-zinc-800/60">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                Temas Revisados
              </h3>
              
              <div className="space-y-4">
                {session.topics.map((topic, idx) => (
                  <div 
                    key={idx} 
                    className="p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 hover:border-cyan-500/30 transition-all space-y-1.5 relative overflow-hidden"
                  >
                    {/* Left cyan accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400" />
                    
                    <h4 className="text-xs font-bold text-zinc-100 pl-2">
                      {topic.title}
                    </h4>
                    
                    <p className="text-[11px] text-zinc-400 leading-relaxed pl-2">
                      {topic.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-8 py-6 text-xs text-zinc-500 font-medium border-t border-zinc-900 bg-[#0c0c0e]/60" data-purpose="site-footer">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <p>Impulso IA</p>
          </div>
          <p>Acerca de: Desarrollado por Nikolas Prado - Impulso IA v0.4.0</p>
        </div>
      </footer>
    </div>
  );
}
