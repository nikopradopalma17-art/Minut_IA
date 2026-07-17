export interface TranscriptLine {
  id: string;
  speaker: string;
  time: string;
  text: string;
}

export interface MeetingTopic {
  title: string;
  content: string;
}

export interface Session {
  id: string;
  title: string;
  date: string;
  context: string;
  model: string;
  language: string;
  transcripts: TranscriptLine[];
  summary: string;
  participants: string[];
  topics: MeetingTopic[];
}

export type ScreenType = 'dashboard' | 'intelligence';
