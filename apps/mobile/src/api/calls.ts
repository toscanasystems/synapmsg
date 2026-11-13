import { apiClient } from './client';

export type CallReadyPeer = {
  userId: string;
  name: string;
  email?: string;
  online: boolean;
};

export type PendingCallInvite = {
  id: string;
  chatId: string;
  fromUserId: string;
  fromName?: string;
  callType: 'voice' | 'video';
  callRoom: string;
  isGroup?: boolean;
  createdAt: string;
};

export const callsApi = {
  async pending(): Promise<{
    pending: PendingCallInvite[];
    meOnline: boolean;
  }> {
    const { data } = await apiClient.get<{
      pending: PendingCallInvite[];
      meOnline: boolean;
    }>('/calls/pending');
    return data;
  },

  async ready(chatId: string): Promise<{
    meOnline: boolean;
    peers: CallReadyPeer[];
  }> {
    const { data } = await apiClient.get<{
      meOnline: boolean;
      peers: CallReadyPeer[];
    }>(`/calls/ready/${chatId}`);
    return data;
  },

  async invite(opts: {
    chatId: string;
    callType: 'voice' | 'video';
    fromName?: string;
  }): Promise<{
    ok: boolean;
    callRoom: string;
    peerOnline: boolean;
    isGroup?: boolean;
    peers: CallReadyPeer[];
  }> {
    const { data } = await apiClient.post<{
      ok: boolean;
      callRoom: string;
      peerOnline: boolean;
      isGroup?: boolean;
      peers: CallReadyPeer[];
    }>('/calls/invite', opts);
    return data;
  },

  async accept(chatId: string): Promise<{
    ok: boolean;
    callRoom: string;
    isGroup?: boolean;
  }> {
    const { data } = await apiClient.post<{
      ok: boolean;
      callRoom: string;
      isGroup?: boolean;
    }>('/calls/accept', { chatId });
    return data;
  },

  async leave(chatId: string): Promise<{ ok: boolean; ended?: boolean }> {
    const { data } = await apiClient.post<{ ok: boolean; ended?: boolean }>(
      '/calls/leave',
      { chatId },
    );
    return data;
  },

  async end(chatId: string): Promise<void> {
    await apiClient.post('/calls/end', { chatId });
  },
};

export default callsApi;
