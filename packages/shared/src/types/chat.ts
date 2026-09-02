/** One conversational turn sent with a follow-up question. Kept deliberately small. */
export interface DraftChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DraftChatRequest {
  message: string;
  /** Recent context only; the server caps this again before it reaches the model. */
  history?: DraftChatMessage[];
}

export type DraftChatProvider = 'openai' | 'anthropic';

export interface DraftChatSessionRequest {
  provider: DraftChatProvider;
  apiKey: string;
  /** Optional provider model id. The server uses a documented default when omitted. */
  model?: string;
}

export interface DraftChatSessionStatus {
  configured: boolean;
  provider: DraftChatProvider | null;
  model: string | null;
  /** Inactivity window after which the in-memory key is destroyed. */
  expiresAfterMinutes: number;
}

export interface DraftChatResponse {
  answer: string;
  provider: DraftChatProvider;
  model: string;
  /** Board version used to answer, so the UI can disclose if the draft moved meanwhile. */
  boardVersion: number;
}

export interface DraftChatError {
  error: string;
  code: 'chat-not-configured' | 'no-active-draft' | 'invalid-request' | 'model-error';
}
