import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { INITIAL_SESSIONS } from './data';
import { Session, ScreenType } from './types';
import DashboardScreen from './components/DashboardScreen';
import IntelligenceScreen from './components/IntelligenceScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('dashboard');
  const [sessions, setSessions] = useState<Session[]>(INITIAL_SESSIONS);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('revision-estrategia-ia');
  const [activeModel, setActiveModel] = useState<string>('QWEN3.5');

  const selectedSession = sessions.find(s => s.id === selectedSessionId) || sessions[0];

  const handleSelectSession = (id: string) => {
    setSelectedSessionId(id);
    setCurrentScreen('intelligence');
  };

  const handleNavigateToIntelligence = () => {
    setCurrentScreen('intelligence');
  };

  const handleBackToDashboard = () => {
    setCurrentScreen('dashboard');
  };

  const handleUpdateSession = (updatedSession: Session) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
  };

  return (
    <div className="bg-[#0a0e14] min-h-screen text-gray-200 selection:bg-cyan-500/30 selection:text-cyan-300">
      <AnimatePresence mode="wait">
        {currentScreen === 'dashboard' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <DashboardScreen 
              sessions={sessions}
              onSelectSession={handleSelectSession}
              onNavigateToIntelligence={handleNavigateToIntelligence}
              activeModel={activeModel}
              setActiveModel={setActiveModel}
            />
          </motion.div>
        ) : (
          <motion.div
            key="intelligence"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <IntelligenceScreen 
              session={selectedSession}
              onBackToDashboard={handleBackToDashboard}
              onUpdateSession={handleUpdateSession}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
