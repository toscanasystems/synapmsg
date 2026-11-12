import { apiClient } from './client';

export type PollOptionView = {
  id: string;
  text: string;
  votes: number;
  voters: string[];
};

export type PollView = {
  id: string;
  chatId: string;
  question: string;
  anonymous: boolean;
  quiz: boolean;
  correctOptionId: string | null;
  messageId: string | null;
  createdAt: string;
  totalVotes: number;
  myVote: string | null;
  options: PollOptionView[];
};

export const pollsApi = {
  async create(
    chatId: string,
    body: {
      question: string;
      options: string[];
      anonymous?: boolean;
      quiz?: boolean;
      correctOptionIndex?: number;
    },
  ): Promise<PollView> {
    const { data } = await apiClient.post<{ poll: PollView }>(
      `/chats/${chatId}/polls`,
      body,
    );
    return data.poll;
  },

  async vote(
    chatId: string,
    pollId: string,
    optionId: string,
  ): Promise<PollView> {
    const { data } = await apiClient.post<{ poll: PollView }>(
      `/chats/${chatId}/polls/${pollId}/vote`,
      { optionId },
    );
    return data.poll;
  },

  async get(chatId: string, pollId: string): Promise<PollView> {
    const { data } = await apiClient.get<{ poll: PollView }>(
      `/chats/${chatId}/polls/${pollId}`,
    );
    return data.poll;
  },
};

export default pollsApi;
