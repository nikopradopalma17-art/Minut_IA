import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mic, FileText, CheckSquare, Sparkles, Upload, Search, Download, ArrowRight, Shield } from 'lucide-react';
import { Session } from '../types';

interface DashboardScreenProps {
  sessions: Session[];
  onSelectSession: (id: string) => void;
  onNavigateToIntelligence: () => void;
  activeModel: string;
  setActiveModel: (model: string) => void;
}

export default function DashboardScreen({
  sessions,
  onSelectSession,
  onNavigateToIntelligence,
  activeModel,
  setActiveModel
}: DashboardScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.context.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDownloadModel = (modelName: string) => {
    if (downloadingModel) return;
    setDownloadingModel(modelName);
    setDownloadProgress(0);
    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setDownloadingModel(null);
            setActiveModel(modelName);
          }, 600);
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  return (
    <div className="bg-grid-subtle min-h-screen text-zinc-100 font-sans flex flex-col relative overflow-hidden" style={{ background: 'radial-gradient(circle at center, #111115 0%, #09090b 100%)' }}>
      
      {/* Top Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur-md" data-purpose="main-navigation">
        <div className="flex items-center space-x-3 animate-fade-in" data-purpose="logo">
          <div className="w-8 h-8 bg-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-500/30">
            <span className="text-cyan-400 font-bold text-lg">M</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Impulso IA
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[9px] font-bold uppercase tracking-wider border border-cyan-500/30">V2.4 Active</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-10 text-zinc-400 text-sm font-medium">
          <a className="text-cyan-400 font-semibold hover:text-cyan-300 transition-colors" href="#">Inicio</a>
          <a className="cursor-pointer hover:text-cyan-300 transition-colors flex items-center gap-1.5" onClick={onNavigateToIntelligence}>
            <span>Reuniones</span>
          </a>
          <a className="hover:text-cyan-300 transition-colors" href="#ajustes">Ajustes</a>
          <a className="hover:text-cyan-300 transition-colors" href="#nosotros">Nosotros</a>
          
          <button className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center bg-[#161618] hover:bg-zinc-800 transition-all text-zinc-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <main className="flex-grow px-12 py-8 max-w-[1600px] mx-auto w-full">
        {/* Hero Title */}
        <header className="mb-10">
          <h1 className="text-5xl font-extrabold mb-2 tracking-tight text-white">MinutIA</h1>
          <p className="text-zinc-400 text-lg">Tu mejor transcriptor privado y gratis</p>
        </header>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-12 gap-8 items-stretch">
          
          {/* LEFT COLUMN: Metrics & AI Model */}
          <div className="col-span-12 lg:col-span-3 space-y-8 flex flex-col justify-between">
            
            {/* Metrics Card */}
            <section className="bg-[#161618] rounded-3xl border border-zinc-800 p-6 glow-border-cyan flex-grow" data-purpose="metrics-card">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6" style={{ fontSize: '10px', letterSpacing: '0.2em' }}>
                MÉTRICAS CLAVE
              </h3>
              <div className="space-y-4">
                <div className="flex items-center p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/60 hover:bg-zinc-800/40 transition-all cursor-default">
                  <div className="p-2.5 bg-cyan-500/10 rounded-xl mr-4 flex items-center justify-center border border-cyan-500/20">
                    <Mic className="w-5 h-5 text-cyan-450" />
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold block text-sm">Reuniones Realizadas</span>
                    <span className="text-xs text-zinc-500 font-mono">14 sesiones guardadas</span>
                  </div>
                </div>
                
                <div className="flex items-center p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/60 hover:bg-zinc-800/40 transition-all cursor-default">
                  <div className="p-2.5 bg-purple-500/10 rounded-xl mr-4 flex items-center justify-center border border-purple-500/20">
                    <FileText className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold block text-sm">Transcripciones Generadas</span>
                    <span className="text-xs text-zinc-500 font-mono">100% efectivas</span>
                  </div>
                </div>
                
                <div className="flex items-center p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/60 hover:bg-zinc-800/40 transition-all cursor-default">
                  <div className="p-2.5 bg-amber-500/10 rounded-xl mr-4 flex items-center justify-center border border-amber-500/20">
                    <CheckSquare className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <span className="text-zinc-200 font-semibold block text-sm">Compromisos Abiertos</span>
                    <span className="text-xs text-zinc-500 font-mono">8 tareas automatizadas</span>
                  </div>
                </div>
              </div>
            </section>

            {/* AI Model Card */}
            <section className="bg-[#161618] rounded-3xl border border-zinc-800 p-6 flex-grow mt-6">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6" style={{ fontSize: '10px', letterSpacing: '0.2em' }}>
                MODELO IA
              </h3>
              <div className="space-y-6">
                
                {/* Model QWEN3.5 */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-500 block">Modelo:</span>
                    <span className="text-zinc-200 text-sm font-medium">QWEN3.5</span>
                  </div>
                  <button 
                    onClick={() => setActiveModel('QWEN3.5')}
                    className={`flex items-center text-[10px] px-3 py-1 rounded-full font-bold transition-all ${
                      activeModel === 'QWEN3.5'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${activeModel === 'QWEN3.5' ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-650'}`}></span>
                    {activeModel === 'QWEN3.5' ? 'Activo' : 'Seleccionar'}
                  </button>
                </div>

                {/* Model Gemma 4:2B */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-500 block">Modelo:</span>
                    <span className="text-zinc-200 text-sm font-medium">Gemma 4:2B</span>
                  </div>
                  {downloadingModel === 'Gemma 4:2B' ? (
                    <div className="w-24 bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-cyan-500 h-2 rounded-full transition-all duration-150" style={{ width: `${downloadProgress}%` }}></div>
                    </div>
                  ) : activeModel === 'Gemma 4:2B' ? (
                    <span className="flex items-center text-[10px] bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full font-bold border border-cyan-500/30">
                      <span className="w-1.5 h-1.5 bg-cyan-450 rounded-full mr-1.5 animate-pulse"></span> Activo
                    </span>
                  ) : (
                    <button 
                      onClick={() => handleDownloadModel('Gemma 4:2B')}
                      className="flex items-center text-xs text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-500/20 px-2.5 py-1 rounded-full bg-cyan-500/5 hover:bg-cyan-500/10"
                    >
                      <Download className="w-3.5 h-3.5 mr-1 animate-bounce" />
                      Descargar
                    </button>
                  )}
                </div>

                {/* Model Avanzado v3 */}
                <div className="flex items-center justify-between border-t border-zinc-800/60 pt-4">
                  <div>
                    <span className="text-xs text-zinc-500 block">Nube Premium:</span>
                    <span className="text-zinc-200 text-sm font-medium">Avanzado v3</span>
                  </div>
                  <button 
                    onClick={() => setActiveModel('Avanzado v3')}
                    className={`flex items-center text-[10px] px-3 py-1 rounded-full font-bold transition-all ${
                      activeModel === 'Avanzado v3'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${activeModel === 'Avanzado v3' ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-650'}`}></span>
                    {activeModel === 'Avanzado v3' ? 'Activo' : 'Seleccionar'}
                  </button>
                </div>

              </div>
            </section>
          </div>

          {/* CENTER COLUMN: Central Voice Command / Microphone Button */}
          <div className="col-span-12 lg:col-span-5 flex flex-col items-center justify-center">
            <section className="bg-[#161618] rounded-3xl border border-zinc-800 w-full aspect-square flex flex-col items-center justify-center p-12 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent"></div>
              
              <h2 className="text-lg font-bold tracking-widest mb-16 text-zinc-400 uppercase">EMPIEZA A GRABAR</h2>
              
              {/* Mic Icon Clickable Group. XPath matches:
                  //div[contains(@class, 'animate-pulse-cyan')]/ancestor::div[contains(@class, 'group')] */}
              <div 
                onClick={onNavigateToIntelligence}
                className="group relative cursor-pointer flex flex-col items-center justify-center"
              >
                {/* Visualizer pulsers as specified in bento theme */}
                <div className="absolute w-64 h-64 bg-cyan-500/10 rounded-full animate-pulse"></div>
                <div className="absolute w-48 h-48 bg-cyan-500/20 rounded-full animate-pulse opacity-50"></div>
                
                {/* Mic circle matching the cyan 32x32 design exactly */}
                <div 
                  className="w-32 h-32 bg-cyan-400 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(34,211,238,0.4)] border-4 border-cyan-300/30 transition-transform duration-500 group-hover:scale-110 z-10 relative"
                >
                  <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </div>

              {/* Import audio widget */}
              <div className="mt-16 text-center group cursor-pointer relative z-10">
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  id="audio-upload"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      onNavigateToIntelligence();
                    }
                  }}
                />
                <label htmlFor="audio-upload" className="cursor-pointer">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto mb-4 flex items-center justify-center group-hover:border-cyan-400 transition-colors">
                    <Upload className="w-6 h-6 text-zinc-400 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <p className="text-zinc-400 font-medium group-hover:text-cyan-400 transition-colors">Importar Audio</p>
                </label>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Search Bar & Recent Sessions */}
          <div className="col-span-12 lg:col-span-4 space-y-8 flex flex-col justify-between">
            
            {/* Search Bar */}
            <div className="relative" data-purpose="search-container">
              <input 
                className="w-full bg-[#161618] border border-zinc-800 rounded-2xl py-4 px-12 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-sm"
                placeholder="Busca contenido de tus reuniones" 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>

            {/* Recent Sessions */}
            <section className="bg-[#161618] rounded-3xl border border-zinc-800 p-8 glow-border-cyan flex-grow mt-4">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest" style={{ fontSize: '10px', letterSpacing: '0.2em' }}>
                  ÚLTIMAS SESIONES
                </h3>
                <span className="text-cyan-400 text-xs font-mono">11 Jul 2026</span>
              </div>
              
              {filteredSessions.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  No se encontraron sesiones que coincidan.
                </div>
              ) : (
                <ul className="space-y-4">
                  {filteredSessions.map((session) => {
                    const isRevision = session.id === 'revision-estrategia-ia';
                    return (
                      <li 
                        key={session.id}
                        onClick={() => onSelectSession(session.id)}
                        className="flex flex-col gap-1 p-4 bg-[#1c1c1f] rounded-2xl border border-zinc-800 hover:border-cyan-500/50 cursor-pointer transition-all hover:scale-[1.02] duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-zinc-500">{session.date}</span>
                          <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-mono">{session.model}</span>
                        </div>
                        {isRevision ? (
                          <span className="text-zinc-200 font-bold text-sm hover:text-cyan-400 transition-colors mt-1">
                            Revisión de Estrategia IA
                          </span>
                        ) : (
                          <span className="text-zinc-200 font-bold text-sm hover:text-cyan-400 transition-colors mt-1">
                            {session.title}
                          </span>
                        )}
                        <p className="text-xs text-zinc-400 line-clamp-1 mt-1 leading-relaxed">
                          {session.context}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-8 text-xs text-zinc-500 font-medium border-t border-zinc-900 bg-[#0c0c0e]/60" data-purpose="site-footer">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center">
          <p>Impulso IA © 2028 - Versión 2.0.0</p>
          <div className="flex space-x-4">
            <a className="hover:text-white transition-colors" href="#terminos">Términos</a>
            <a className="hover:text-white transition-colors" href="#privacidad">Privacidad</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
