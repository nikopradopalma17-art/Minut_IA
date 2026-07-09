import { invoke } from '@tauri-apps/api/core';

export interface SmartSearchMeetingHit {
  id: string;
  title: string;
  createdAt: string;
}

export interface SmartSearchContentHit {
  meetingId: string;
  meetingTitle: string;
  snippet: string;
}

export interface SmartSearchCommitmentHit {
  id: string;
  meeting_id: string;
  meeting_title: string;
  responsible: string | null;
  description: string;
  due_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SmartSearchResults {
  meetings: SmartSearchMeetingHit[];
  transcripts: SmartSearchContentHit[];
  summaries: SmartSearchContentHit[];
  commitments: SmartSearchCommitmentHit[];
  usedFts: boolean;
}

export class SearchService {
  async smartSearch(query: string): Promise<SmartSearchResults> {
    return invoke<SmartSearchResults>('api_smart_search', { query });
  }
}

export const searchService = new SearchService();
