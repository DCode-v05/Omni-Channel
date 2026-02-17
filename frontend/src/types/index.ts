export interface Metadata {
  channel: string;
  user_id?: string;
  session_id?: string;
  timestamp: string;
}

export interface ApiResponse {
  input_id: string;
  llm_response: string;
}

export interface SubmitTextParams {
  channel: string;
  text: string;
  user_id?: string;
  session_id?: string;
}

export interface SubmitFileParams {
  channel: string;
  file: File;
  user_id?: string;
  session_id?: string;
}

export type InputType = 'text' | 'audio' | 'document' | 'image';

